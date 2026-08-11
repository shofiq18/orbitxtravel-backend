import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';
import config from '../../../config/index.js';
import { generateVoucherPDF } from '../../utils/generateVoucher.js';
import { sendSMS } from '../../utils/sendSMS.js';
import { sendEmail } from '../../utils/sendEmail.js';
import { triggerAutomaticPayout } from '../../utils/bkashPayout.js';

const createBooking = async (travelerId: string, payload: any) => {
  const { packageId, seatsBooked, roomId, hotelId, roomQuantity, checkInDate, checkOutDate } = payload;

  if (roomId) {
    // Hotel stays booking implementation
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { hotel: true },
    });

    if (!room) {
      throw new AppError(404, 'Room category not found.');
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkIn >= checkOut) {
      throw new AppError(400, 'Check-out date must be after check-in date.');
    }

    // Calculate stay duration nights
    const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    // Check booked capacity overlaps in database
    const overlappingBookings = await prisma.booking.findMany({
      where: {
        roomId,
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        AND: [
          { checkInDate: { lt: checkOut } },
          { checkOutDate: { gt: checkIn } },
        ],
      },
    });

    const bookedQuantity = overlappingBookings.reduce((sum, b) => sum + (b.roomQuantity || 0), 0);
    const remainingInventory = Math.max(0, room.inventory - bookedQuantity);

    if (remainingInventory < roomQuantity) {
      throw new AppError(
        400,
        `Not enough available rooms for the selected dates. Requested: ${roomQuantity}, Available: ${remainingInventory}`
      );
    }

    const totalAmount = room.b2cPrice * nights * roomQuantity;
    const paidAmount = totalAmount; // For stays, full payment is simulated

    const booking = await prisma.booking.create({
      data: {
        travelerId,
        hotelId,
        roomId,
        roomQuantity,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        totalAmount,
        paidAmount,
        paymentStatus: 'PENDING',
        bookingStatus: 'PENDING',
      },
      include: {
        room: true,
        hotel: true,
      },
    });

    return booking;
  }

  // Tour Packages booking implementation
  const tourPackage = await prisma.package.findUnique({
    where: { id: packageId },
  });

  if (!tourPackage) {
    throw new AppError(404, 'Tour package not found.');
  }

  if (new Date(tourPackage.startDate) <= new Date()) {
    throw new AppError(400, 'Cannot book a tour package that has already departed.');
  }

  if (tourPackage.availableSeats < seatsBooked) {
    throw new AppError(
      400,
      `Not enough available seats. Requested: ${seatsBooked}, Available: ${tourPackage.availableSeats}`
    );
  }

  const totalAmount = tourPackage.totalPackagePrice * seatsBooked;
  const paidAmount = tourPackage.minimumSeatLockFee * seatsBooked;

  const booking = await prisma.booking.create({
    data: {
      travelerId,
      packageId,
      seatsBooked,
      totalAmount,
      paidAmount,
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING',
    },
    include: {
      package: true,
    },
  });

  return booking;
};

const payBooking = async (travelerId: string, bookingId: string, payload: { paymentMethod: string }) => {
  const { paymentMethod } = payload;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      package: {
        include: {
          organizer: true,
        },
      },
      room: {
        include: {
          hotel: true,
        },
      },
      traveler: true,
    },
  });

  if (!booking) {
    throw new AppError(404, 'Booking not found.');
  }

  if (booking.travelerId !== travelerId) {
    throw new AppError(403, 'Forbidden: You do not own this booking request.');
  }

  if (booking.paymentStatus === 'PAID') {
    throw new AppError(400, 'This booking has already been paid and locked.');
  }

  const txnId = `TXN_${paymentMethod.toUpperCase()}_${Math.random()
    .toString(36)
    .substr(2, 9)
    .toUpperCase()}`;

  // If Hotel stays booking payment
  if (booking.roomId && booking.room) {
    // Re-verify availability to prevent race conditions
    const overlappingBookings = await prisma.booking.findMany({
      where: {
        roomId: booking.roomId,
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        AND: [
          { checkInDate: { lt: booking.checkOutDate ?? undefined } },
          { checkOutDate: { gt: booking.checkInDate ?? undefined } },
        ],
      },
    });

    const bookedQuantity = overlappingBookings.reduce((sum, b) => sum + (b.roomQuantity || 0), 0);
    const remainingInventory = Math.max(0, booking.room.inventory - bookedQuantity);

    if (remainingInventory < (booking.roomQuantity || 1)) {
      throw new AppError(400, 'Selected room category is no longer available for these dates.');
    }

    const updatedBooking = await prisma.$transaction(async (tx) => {
      // Create ledger transaction log
      await tx.transaction.create({
        data: {
          type: 'SEAT_LOCK',
          amount: booking.paidAmount,
          senderId: travelerId,
          receiverId: booking.room!.hotel.ownerId,
          referenceId: booking.id,
          status: 'COMPLETED',
        },
      });

      // Update booking status
      const b = await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'PAID',
          bookingStatus: 'CONFIRMED',
          paymentTxnId: txnId,
        },
      });
      return b;
    });

    // Create traveler confirmation alerts
    await prisma.notification.create({
      data: {
        userId: travelerId,
        title: 'Stay Booking Confirmed!',
        message: `Your stays at ${booking.room.hotel.name} (${booking.room.type}) has been confirmed. Ref: ${txnId}`,
      },
    });

    await prisma.notification.create({
      data: {
        userId: booking.room.hotel.ownerId,
        title: 'New Room Stay Booking',
        message: `${booking.traveler.fullName} booked ${booking.roomQuantity} room(s) of category ${booking.room.type} at ${booking.room.hotel.name}.`,
      },
    });

    // Trigger automatic payout disbursal simulation
    await triggerAutomaticPayout(updatedBooking.id);

    return {
      id: updatedBooking.id,
      paymentTxnId: updatedBooking.paymentTxnId,
      paidAmount: updatedBooking.paidAmount,
      voucherUrl: "",
      bookingStatus: updatedBooking.bookingStatus,
    };
  }

  // Double check seat availability before locking transaction
  if (booking.package && booking.package.availableSeats < (booking.seatsBooked || 0)) {
    throw new AppError(400, 'Seats are no longer available for this tour package.');
  }

  // Execute payment transaction processing in database for Package
  const updatedBooking = await prisma.$transaction(async (tx) => {
    // 1. Decrement package seats
    await tx.package.update({
      where: { id: booking.packageId! },
      data: {
        availableSeats: {
          decrement: booking.seatsBooked!,
        },
      },
    });

    // 2. Compute commission retention
    const platformCommission = booking.paidAmount * config.platform_commission_rate;
    const hostShare = booking.paidAmount - platformCommission;

    // 3. Create transactions ledger logs
    await tx.transaction.create({
      data: {
        type: 'SEAT_LOCK',
        amount: booking.paidAmount,
        senderId: travelerId,
        receiverId: booking.package!.organizerId,
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

    // Commission retention deduction
    await tx.transaction.create({
      data: {
        type: 'PLATFORM_COMMISSION',
        amount: platformCommission,
        senderId: booking.package!.organizerId,
        receiverId: null,
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

    // 4. Generate PDF Voucher
    const voucherUrl = await generateVoucherPDF(
      booking,
      booking.package!.title,
      booking.traveler.fullName
    );

    // 5. Update Booking
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        paymentTxnId: txnId,
        voucherUrl,
      },
      include: {
        package: true,
      },
    });

    return updated;
  });

  // Send Alerts
  await prisma.notification.create({
    data: {
      userId: travelerId,
      title: 'Booking Confirmed!',
      message: `Your booking for ${booking.package!.title} has been confirmed. Transaction Ref: ${txnId}`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: booking.package!.organizerId,
      title: 'New Seat Lock Booking',
      message: `${booking.traveler.fullName} booked ${booking.seatsBooked} seat(s) for your tour: ${booking.package!.title}.`,
    },
  });

  const travelerSMS = `orbitX Travel: Booking CONFIRMED! Reference: ${bookingId}. Tour: ${booking.package!.title}. Seats: ${booking.seatsBooked}. Download Voucher: ${updatedBooking.voucherUrl}`;
  await sendSMS(booking.traveler.email, travelerSMS);

  // Trigger automatic payout disbursal simulation
  await triggerAutomaticPayout(updatedBooking.id);

  const hostSMS = `orbitX Travel: New seat lock booking for your tour "${booking.package!.title}" by ${booking.traveler.fullName}. Seats: ${booking.seatsBooked}. Reference: ${bookingId}.`;
  await sendSMS(booking.package!.organizer.email, hostSMS);

  const travelerEmail = `
    <h1>Your Booking is Confirmed - orbitX Travel</h1>
    <p>Dear ${booking.traveler.fullName},</p>
    <p>Your seat lock payment of <strong>BDT ${booking.paidAmount}</strong> for the tour <strong>"${booking.package!.title}"</strong> has been successfully received.</p>
    <p><strong>Transaction ID:</strong> ${txnId}</p>
    <p><strong>Seats Booked:</strong> ${booking.seatsBooked}</p>
    <p>You can download your official PDF travel voucher here: <a href="${config.email_host === 'smtp.gmail.com' ? 'http://localhost:' + config.port + updatedBooking.voucherUrl : updatedBooking.voucherUrl}">Download Voucher PDF</a></p>
  `;
  await sendEmail(booking.traveler.email, 'Booking Confirmed - orbitX Travel', travelerEmail);

  return updatedBooking;
};

const getBookingsByUser = async (userId: string, activeRole: string) => {
  const conditions: any = {};

  if (activeRole === 'traveler') {
    conditions.travelerId = userId;
  } else if (activeRole === 'tour_organizer') {
    conditions.package = {
      organizerId: userId,
    };
  } else if (activeRole === 'hotel_owner') {
    conditions.hotel = {
      ownerId: userId,
    };
  } else if (activeRole === 'admin') {
    // Admin retrieves all bookings
  } else {
    throw new AppError(403, 'Unauthorized role access.');
  }

  const bookings = await prisma.booking.findMany({
    where: conditions,
    include: {
      package: {
        include: {
          organizer: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      },
      hotel: true,
      room: true,
      traveler: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return bookings;
};

const getBookingById = async (userId: string, activeRole: string, bookingId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      package: {
        include: {
          organizer: true,
        },
      },
      hotel: true,
      room: true,
      traveler: true,
    },
  });

  if (!booking) {
    throw new AppError(404, 'Booking not found.');
  }

  const isOwner =
    booking.travelerId === userId ||
    (booking.package && booking.package.organizerId === userId) ||
    (booking.hotel && booking.hotel.ownerId === userId) ||
    activeRole === 'admin';

  if (!isOwner) {
    throw new AppError(403, 'Forbidden: You do not have permission to view this booking.');
  }

  return booking;
};

const sendPreTripSMSAlerts = async () => {
  const now = new Date();
  const lowerBound = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const upperBound = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      package: {
        startDate: {
          gte: lowerBound,
          lte: upperBound,
        },
      },
    },
    include: {
      package: {
        include: {
          organizer: true,
        },
      },
      traveler: true,
    },
  });

  let sentCount = 0;

  for (const booking of bookings) {
    const alertMessage = `orbitX Travel Alert: Reminder! Your tour "${booking.package!.title}" departs in 24 hours. Contact Host Guide: ${booking.package!.organizer.fullName} (${booking.package!.organizer.email})`;
    await sendSMS(booking.traveler.email, alertMessage);
    sentCount++;
  }

  return { sentCount };
};

export const BookingService = {
  createBooking,
  payBooking,
  getBookingsByUser,
  getBookingById,
  sendPreTripSMSAlerts,
};
