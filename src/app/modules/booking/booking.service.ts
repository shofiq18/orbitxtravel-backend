import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';
import config from '../../../config/index.js';
import { generateVoucherPDF } from '../../utils/generateVoucher.js';
import { sendSMS } from '../../utils/sendSMS.js';
import { sendEmail } from '../../utils/sendEmail.js';

const createBooking = async (travelerId: string, payload: any) => {
  const { packageId, seatsBooked } = payload;

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

  // Double check seat availability before locking transaction
  if (booking.package.availableSeats < booking.seatsBooked) {
    throw new AppError(400, 'Seats are no longer available for this tour package.');
  }

  const txnId = `TXN_${paymentMethod.toUpperCase()}_${Math.random()
    .toString(36)
    .substr(2, 9)
    .toUpperCase()}`;

  // Execute payment transaction processing in database
  const updatedBooking = await prisma.$transaction(async (tx) => {
    // 1. Decrement package seats
    await tx.package.update({
      where: { id: booking.packageId },
      data: {
        availableSeats: {
          decrement: booking.seatsBooked,
        },
      },
    });

    // 2. Compute commission retention
    const platformCommission = booking.paidAmount * config.platform_commission_rate;
    const hostShare = booking.paidAmount - platformCommission;

    // 3. Create transactions ledger logs
    // Traveler to Host full deposit lock payment
    await tx.transaction.create({
      data: {
        type: 'SEAT_LOCK',
        amount: booking.paidAmount,
        senderId: travelerId,
        receiverId: booking.package.organizerId,
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

    // Commission retention deduction
    await tx.transaction.create({
      data: {
        type: 'PLATFORM_COMMISSION',
        amount: platformCommission,
        senderId: booking.package.organizerId,
        receiverId: null, // System holds the commission
        referenceId: booking.id,
        status: 'COMPLETED',
      },
    });

    // 4. Generate PDF Voucher
    const voucherUrl = await generateVoucherPDF(
      booking,
      booking.package.title,
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

  // 6. Send Automated Alerts (Notifications, SMS, Email)
  // Create system notifications
  await prisma.notification.create({
    data: {
      userId: travelerId,
      title: 'Booking Confirmed!',
      message: `Your booking for ${booking.package.title} has been confirmed. Transaction Ref: ${txnId}`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: booking.package.organizerId,
      title: 'New Seat Lock Booking',
      message: `${booking.traveler.fullName} booked ${booking.seatsBooked} seat(s) for your tour: ${booking.package.title}.`,
    },
  });

  // Automated SMS triggers
  const travelerSMS = `orbitX Travel: Booking CONFIRMED! Reference: ${bookingId}. Tour: ${booking.package.title}. Seats: ${booking.seatsBooked}. Download Voucher: ${updatedBooking.voucherUrl}`;
  await sendSMS(booking.traveler.email, travelerSMS); // Emulates phone mapping by email target or mock log

  const hostSMS = `orbitX Travel: New seat lock booking for your tour "${booking.package.title}" by ${booking.traveler.fullName}. Seats: ${booking.seatsBooked}. Reference: ${bookingId}.`;
  await sendSMS(booking.package.organizer.email, hostSMS);

  // Email with Voucher PDF Attachment simulation
  const travelerEmail = `
    <h1>Your Booking is Confirmed - orbitX Travel</h1>
    <p>Dear ${booking.traveler.fullName},</p>
    <p>Your seat lock payment of <strong>BDT ${booking.paidAmount}</strong> for the tour <strong>"${booking.package.title}"</strong> has been successfully received.</p>
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
  } else if (activeRole === 'admin') {
    // Admins retrieve all bookings in the system
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
      traveler: true,
    },
  });

  if (!booking) {
    throw new AppError(404, 'Booking not found.');
  }

  const isOwner =
    booking.travelerId === userId ||
    booking.package.organizerId === userId ||
    activeRole === 'admin';

  if (!isOwner) {
    throw new AppError(403, 'Forbidden: You do not have permission to view this booking.');
  }

  return booking;
};

const sendPreTripSMSAlerts = async () => {
  const now = new Date();
  const lowerBound = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
  const upperBound = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

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
    const alertMessage = `orbitX Travel Alert: Reminder! Your tour "${booking.package.title}" departs in 24 hours. Contact Host Guide: ${booking.package.organizer.fullName} (${booking.package.organizer.email})`;
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
