import { Role } from '@prisma/client';
import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';
import { sendEmail } from '../../utils/sendEmail.js';
import { BookingService } from '../booking/booking.service.js';

const getVendorsQueue = async () => {
  const vendors = await prisma.user.findMany({
    where: {
      vendorType: { not: null },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      currentRole: true,
      isVerified: true,
      vendorType: true,
      verificationDocUrl: true,
      businessProfile: true,
      payoutDetails: true,
      createdAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return vendors;
};

const verifyVendor = async (userId: string, isVerified: boolean) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  if (!user.vendorType) {
    throw new AppError(400, 'This user has not requested vendor status.');
  }

  const vendorType = user.vendorType as Role;

  // Update vendor status
  const updatedUser = await prisma.$transaction(async (tx) => {
    let updatedRoles = [...user.roles];
    
    if (isVerified) {
      if (!updatedRoles.includes(vendorType)) {
        updatedRoles.push(vendorType);
      }
    } else {
      updatedRoles = updatedRoles.filter((r) => r !== vendorType);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        isVerified,
        roles: updatedRoles,
        currentRole: isVerified ? vendorType : 'traveler',
        vendorType: isVerified ? vendorType : null,
      },
    });

    if (isVerified) {
      if (vendorType === 'hotel_owner') {
        await tx.hotel.updateMany({
          where: { ownerId: userId },
          data: { isVerified: true },
        });
      } else if (vendorType === 'tour_organizer') {
        await tx.package.updateMany({
          where: { organizerId: userId },
          data: { isVerified: true },
        });
      }
    }

    return updated;
  });

  await prisma.notification.create({
    data: {
      userId,
      title: isVerified ? 'Vendor Profile Verified!' : 'Vendor Request Rejected',
      message: isVerified
        ? `Congratulations! Your vendor profile has been approved. You are now active as a verified ${user.vendorType === 'hotel_owner' ? 'Hotel Owner' : 'Tour Organizer'}.`
        : 'Your vendor onboarding application was reviewed and rejected. Please contact support.',
    },
  });

  const statusLabel = isVerified ? 'APPROVED' : 'REJECTED';
  const emailBody = `
    <h1>orbitX Travel Vendor Application ${statusLabel}</h1>
    <p>Dear ${user.fullName},</p>
    <p>We are writing to inform you that your application to register as a host (${user.vendorType}) on our platform has been <strong>${statusLabel}</strong>.</p>
    ${
      isVerified
        ? `<p>You can now switch your active view to "Hosting Mode" to start listing properties or launching tour packages.</p>`
        : `<p>If you believe this is a mistake, please review your document upload or appeal with our administration help desk.</p>`
    }
    <p>Regards,<br>orbitX Travel Team</p>
  `;

  await sendEmail(user.email, `orbitX Travel Vendor Profile ${statusLabel}`, emailBody);

  return updatedUser;
};

const getPendingPayments = async () => {
  return await BookingService.getPendingPaymentsForAdmin();
};

const verifyPayment = async (bookingId: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
  return await BookingService.verifyPaymentByAdmin(bookingId, action, reason);
};

const getEscrowBookings = async () => {
  const confirmedBookings = await prisma.booking.findMany({
    where: {
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
    },
    include: {
      traveler: {
        select: { id: true, fullName: true, email: true }
      },
      package: {
        include: { organizer: true }
      },
      room: {
        include: {
          hotel: { include: { owner: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const disbursedPayouts = await prisma.transaction.findMany({
    where: { type: 'HOST_PAYOUT' },
    select: { referenceId: true, amount: true }
  });

  const disbursedMap = new Map<string, number>();
  disbursedPayouts.forEach((p) => {
    if (p.referenceId) {
      const current = disbursedMap.get(p.referenceId) || 0;
      disbursedMap.set(p.referenceId, current + p.amount);
    }
  });

  const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE) || 0.10;

  return confirmedBookings.map((b) => {
    const hostUser = b.package?.organizer || b.room?.hotel?.owner;
    const platformCommission = b.paidAmount * commissionRate;
    const netHostShare = b.paidAmount - platformCommission;
    const alreadyDisbursed = disbursedMap.get(b.id) || 0;
    const remainingDisbursalDue = Math.max(0, netHostShare - alreadyDisbursed);
    const isFullyDisbursed = remainingDisbursalDue <= 0;

    return {
      ...b,
      hostUser,
      platformCommission,
      netHostShare,
      alreadyDisbursed,
      remainingDisbursalDue,
      isFullyDisbursed,
    };
  });
};

const getPlatformCommissions = async () => {
  const commissions = await prisma.transaction.findMany({
    where: { type: 'PLATFORM_COMMISSION' },
    orderBy: { createdAt: 'desc' },
  });
  return commissions;
};

const getPayouts = async () => {
  const payouts = await prisma.transaction.findMany({
    where: { type: 'HOST_PAYOUT' },
    include: {
      receiver: {
        select: {
          fullName: true,
          email: true,
          payoutDetails: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return payouts;
};

const releasePayout = async (payload: { hostId: string; amount: number; referenceId?: string }) => {
  const { hostId, amount, referenceId } = payload;

  const host = await prisma.user.findUnique({
    where: { id: hostId },
  });

  if (!host) {
    throw new AppError(404, 'Host user not found.');
  }

  // Create Payout Transaction record in DB ledger
  const payoutTxn = await prisma.transaction.create({
    data: {
      type: 'HOST_PAYOUT',
      amount,
      senderId: null, // Admin releases payment
      receiverId: hostId,
      referenceId: referenceId || 'PLATFORM_PAYOUT_RELEASE',
      status: 'COMPLETED',
    },
  });

  // Create notifications
  await prisma.notification.create({
    data: {
      userId: hostId,
      title: 'Host Payout Disbursed',
      message: `A payout amount of BDT ${amount} has been disbursed to your account. Ref: ${payoutTxn.id}`,
    },
  });

  // Email Notification
  const emailBody = `
    <h1>Payout Released - orbitX Travel</h1>
    <p>Dear ${host.fullName},</p>
    <p>We have processed and released your payout of <strong>BDT ${amount}</strong> for the trip bookings.</p>
    <p><strong>Reference Txn ID:</strong> ${payoutTxn.id}</p>
    <p>Please check your registered payout method details. Payouts might take 1-3 business days to clear depending on bank operations.</p>
    <p>Best regards,<br>orbitX Travel Operations</p>
  `;
  await sendEmail(host.email, 'Host Payout Disbursed - orbitX Travel', emailBody);

  return payoutTxn;
};

const getAllUsers = async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      currentRole: true,
      isVerified: true,
      vendorType: true,
      isSuspended: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return users;
};

const toggleSuspendUser = async (userId: string, isSuspended: boolean) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isSuspended },
  });

  await prisma.notification.create({
    data: {
      userId,
      title: isSuspended ? 'Account Suspended' : 'Account Reinstated',
      message: isSuspended
        ? 'Your account has been suspended by the platform administrator. Access to list assets or checkout is restricted.'
        : 'Your account suspension has been lifted by the platform administrator. Access is restored.',
    },
  });

  return updatedUser;
};

export const AdminService = {
  getVendorsQueue,
  verifyVendor,
  getPendingPayments,
  verifyPayment,
  getEscrowBookings,
  getPlatformCommissions,
  getPayouts,
  releasePayout,
  getAllUsers,
  toggleSuspendUser,
};
