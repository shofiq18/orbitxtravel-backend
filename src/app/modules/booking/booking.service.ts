import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';
import config from '../../../config/index.js';
import { generateVoucherPDF } from '../../utils/generateVoucher.js';
import { sendSMS } from '../../utils/sendSMS.js';
import { sendEmail } from '../../utils/sendEmail.js';
import { AdminService } from '../admin/admin.service.js';

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

  const activeBookingsAgg = await prisma.booking.aggregate({
    where: {
      packageId,
      bookingStatus: { not: 'CANCELLED' },
    },
    _sum: {
      seatsBooked: true,
    },
  });

  const currentReservedSeats = activeBookingsAgg._sum.seatsBooked || 0;
  const realAvailableSeats = Math.max(0, tourPackage.maxSeats - currentReservedSeats);

  if (realAvailableSeats < seatsBooked) {
    throw new AppError(
      400,
      `Not enough available seats. Requested: ${seatsBooked}, Available: ${realAvailableSeats}`
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

const payBooking = async (travelerId: string, bookingId: string, payload: { paymentMethod: string; senderNumber?: string; transactionId?: string }) => {
  const { paymentMethod, senderNumber, transactionId } = payload;

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

  if (booking.paymentStatus === 'PAID' && booking.bookingStatus === 'CONFIRMED') {
    throw new AppError(400, 'This booking has already been paid and verified.');
  }

  const txnId = transactionId 
    ? (senderNumber ? `TrxID: ${transactionId} (From: ${senderNumber})` : `TrxID: ${transactionId}`)
    : `TXN_${paymentMethod.toUpperCase()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Update booking with payment reference, set status to PENDING verification
  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING',
      paymentTxnId: txnId,
    },
  });

  // Notify traveler that submission is under verification
  await prisma.notification.create({
    data: {
      userId: travelerId,
      title: 'Payment Submitted for Verification',
      message: `Your bKash payment reference (${txnId}) has been submitted. Verification is in progress and typically takes 1-4 hours.`,
    },
  });

  return {
    id: updatedBooking.id,
    paymentTxnId: updatedBooking.paymentTxnId,
    paidAmount: updatedBooking.paidAmount,
    voucherUrl: "",
    bookingStatus: updatedBooking.bookingStatus,
    paymentStatus: updatedBooking.paymentStatus,
  };
};

// Admin action to retrieve all bookings requiring manual bKash verification
const getPendingPaymentsForAdmin = async () => {
  const pendingBookings = await prisma.booking.findMany({
    where: {
      paymentTxnId: { not: null },
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING',
    },
    include: {
      traveler: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      package: {
        include: {
          organizer: true,
        },
      },
      room: {
        include: {
          hotel: {
            include: {
              owner: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return pendingBookings;
};

// Admin action to Approve or Reject a submitted bKash payment reference
const verifyPaymentByAdmin = async (bookingId: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
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
          hotel: {
            include: {
              owner: true,
            },
          },
        },
      },
      traveler: true,
    },
  });

  if (!booking) {
    throw new AppError(404, 'Booking record not found.');
  }

  if (action === 'REJECT') {
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CANCELLED',
        paymentStatus: 'PENDING',
      },
    });

    await prisma.notification.create({
      data: {
        userId: booking.travelerId,
        title: 'bKash Payment Verification Failed',
        message: `Your bKash payment reference (${booking.paymentTxnId}) could not be verified. Reason: ${reason || 'Transaction ID invalid or money not received.'}`,
      },
    });

    await sendEmail(
      booking.traveler.email,
      'bKash Payment Verification Update - OrbitX Travel',
      `<h1>Payment Verification Rejected</h1>
       <p>Dear ${booking.traveler.fullName},</p>
       <p>We could not verify your bKash payment reference <strong>${booking.paymentTxnId}</strong>.</p>
       <p><strong>Reason:</strong> ${reason || 'Transaction ID mismatch or funds not received in OrbitX bKash account.'}</p>
       <p>Please check your transaction details or contact OrbitX support.</p>`
    );

    return updated;
  }

  // Action is APPROVE
  if (booking.roomId && booking.room) {
    // Hotel Stay verification
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
      throw new AppError(400, 'Selected room category is no longer available.');
    }

    const commissionRate = await AdminService.getCommissionRate();
    const platformCommission = booking.totalAmount * commissionRate;
    const netHostEscrowShare = Math.max(0, booking.paidAmount - platformCommission);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          type: 'SEAT_LOCK',
          amount: netHostEscrowShare,
          senderId: booking.travelerId,
          receiverId: booking.room!.hotel.ownerId,
          referenceId: booking.id,
          status: 'COMPLETED',
        },
      });

      await tx.transaction.create({
        data: {
          type: 'PLATFORM_COMMISSION',
          amount: platformCommission,
          senderId: booking.room!.hotel.ownerId,
          receiverId: null,
          referenceId: booking.id,
          status: 'COMPLETED',
        },
      });

      return await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'PAID',
          bookingStatus: 'CONFIRMED',
        },
      });
    });

    // Send notifications
    await prisma.notification.create({
      data: {
        userId: booking.travelerId,
        title: 'bKash Payment Verified & Stay Confirmed!',
        message: `Your bKash payment (${booking.paymentTxnId}) was verified by Admin. Your stay at ${booking.room.hotel.name} is confirmed!`,
      },
    });

    await prisma.notification.create({
      data: {
        userId: booking.room.hotel.ownerId,
        title: 'New Room Stay Booking Confirmed',
        message: `${booking.traveler.fullName}'s booking for ${booking.roomQuantity} room(s) at ${booking.room.hotel.name} has been verified and locked into Escrow.`,
      },
    });

    return updated;
  }

  // Tour Package verification
  const otherConfirmedBookingsAgg = await prisma.booking.aggregate({
    where: {
      packageId: booking.packageId!,
      id: { not: booking.id },
      bookingStatus: { not: 'CANCELLED' },
    },
    _sum: {
      seatsBooked: true,
    },
  });

  const otherReservedSeats = otherConfirmedBookingsAgg._sum.seatsBooked || 0;
  const maxCapacity = booking.package?.maxSeats || 20;
  const realAvailableSeats = Math.max(0, maxCapacity - otherReservedSeats);

  if (realAvailableSeats < (booking.seatsBooked || 0)) {
    throw new AppError(
      400,
      `Seats are no longer available for this tour package. Total Capacity: ${maxCapacity}, Already Booked: ${otherReservedSeats}, Requested: ${booking.seatsBooked || 0}`
    );
  }

  const updatedAvailableSeatsInDb = Math.max(0, maxCapacity - (otherReservedSeats + (booking.seatsBooked || 0)));

  const commissionRate = await AdminService.getCommissionRate();
  const platformCommission = booking.totalAmount * commissionRate;
  const netHostEscrowShare = Math.max(0, booking.paidAmount - platformCommission);

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Update package availableSeats column to synced value
    await tx.package.update({
      where: { id: booking.packageId! },
      data: {
        availableSeats: updatedAvailableSeatsInDb,
      },
    });

    // 2. Create transactions ledger logs
    await tx.transaction.create({
      data: {
        type: 'SEAT_LOCK',
        amount: netHostEscrowShare,
        senderId: booking.travelerId,
        receiverId: booking.package!.organizerId,
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

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
    return await tx.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        voucherUrl,
      },
      include: {
        package: true,
      },
    });
  });

  // Send Alerts
  await prisma.notification.create({
    data: {
      userId: booking.travelerId,
      title: 'bKash Payment Verified & Tour Booking Confirmed!',
      message: `Your bKash payment (${booking.paymentTxnId}) for ${booking.package!.title} has been verified. Download your PDF voucher!`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: booking.package!.organizerId,
      title: 'New Tour Booking Confirmed (Escrow Locked)',
      message: `${booking.traveler.fullName} booked ${booking.seatsBooked} seat(s) for ${booking.package!.title}. Funds are safely held in OrbitX Escrow.`,
    },
  });

  const emailBody = `
    <h1>Booking Verified & Confirmed - OrbitX Travel</h1>
    <p>Dear ${booking.traveler.fullName},</p>
    <p>Great news! Your bKash payment reference <strong>${booking.paymentTxnId}</strong> has been verified by Admin.</p>
    <p><strong>Tour Package:</strong> ${booking.package!.title}</p>
    <p><strong>Seats Booked:</strong> ${booking.seatsBooked}</p>
    <p>Your PDF Voucher is now available for download in your dashboard portal.</p>
    <p>Best regards,<br>OrbitX Travel Team</p>
  `;
  await sendEmail(booking.traveler.email, 'bKash Payment Verified & Tour Confirmed - OrbitX Travel', emailBody);

  return updated;
};

const cancelBookingByUser = async (userId: string, bookingId: string) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { package: true, room: true, traveler: true },
  });

  if (!booking) {
    throw new AppError(404, 'Booking not found.');
  }

  if (booking.travelerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own this booking record.');
  }

  if (booking.bookingStatus === 'CANCELLED') {
    throw new AppError(400, 'This booking is already cancelled.');
  }

  // Restore package seats if booking was confirmed
  if (booking.bookingStatus === 'CONFIRMED' && booking.packageId && booking.seatsBooked) {
    await prisma.package.update({
      where: { id: booking.packageId },
      data: {
        availableSeats: {
          increment: booking.seatsBooked,
        },
      },
    });
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      bookingStatus: 'CANCELLED',
    },
  });

  await prisma.notification.create({
    data: {
      userId,
      title: 'Booking Cancelled',
      message: `Your booking (Ref: ${bookingId}) has been cancelled successfully.`,
    },
  });

  return updatedBooking;
};

const getBookingsByUser = async (userId: string, activeRole: string) => {
  if (activeRole === 'admin') {
    return await prisma.booking.findMany({
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  if (activeRole === 'hotel_owner') {
    return await prisma.booking.findMany({
      where: {
        hotel: {
          ownerId: userId,
        },
      },
      include: {
        hotel: true,
        room: true,
        traveler: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  if (activeRole === 'tour_organizer') {
    return await prisma.booking.findMany({
      where: {
        package: {
          organizerId: userId,
        },
      },
      include: {
        package: true,
        traveler: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Default traveler bookings
  const bookings = await prisma.booking.findMany({
    where: {
      travelerId: userId,
    },
    include: {
      package: {
        include: {
          organizer: true,
        },
      },
      hotel: true,
      room: true,
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
    const alertEmail = `
      <h1>Upcoming Departure Reminder - OrbitX Travel</h1>
      <p>Dear ${booking.traveler.fullName},</p>
      <p>This is a reminder that your tour <strong>"${booking.package!.title}"</strong> departs in 24 hours!</p>
      <p><strong>Host Guide:</strong> ${booking.package!.organizer.fullName} (${booking.package!.organizer.email})</p>
      <p>Wish you a safe and memorable journey!</p>
    `;
    await sendEmail(booking.traveler.email, `Pre-Trip Departure Reminder - OrbitX Travel`, alertEmail);
    sentCount++;
  }

  return { sentCount };
};

export const BookingService = {
  createBooking,
  payBooking,
  getPendingPaymentsForAdmin,
  verifyPaymentByAdmin,
  cancelBookingByUser,
  getBookingsByUser,
  getBookingById,
  sendPreTripSMSAlerts,
};
