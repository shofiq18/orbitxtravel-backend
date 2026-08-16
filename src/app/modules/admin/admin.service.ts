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

const getCommissionRate = async (): Promise<number> => {
  try {
    const setting = await (prisma as any).systemSetting.findUnique({
      where: { key: 'PLATFORM_COMMISSION_RATE' }
    });
    if (setting && setting.value) {
      const parsed = parseFloat(setting.value);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed > 1 ? parsed / 100 : parsed;
      }
    }
  } catch (error) {
    console.error('Error fetching dynamic commission rate:', error);
  }
  return Number(process.env.PLATFORM_COMMISSION_RATE) || 0.10;
};

const getCommissionRateInfo = async () => {
  const decimalRate = await getCommissionRate();
  return {
    ratePercentage: Math.round(decimalRate * 100 * 100) / 100,
    rateDecimal: decimalRate,
  };
};

const updateCommissionRate = async (ratePercentage: number) => {
  if (typeof ratePercentage !== 'number' || ratePercentage < 0 || ratePercentage > 100) {
    throw new AppError(400, 'Commission percentage must be between 0 and 100.');
  }

  const decimalRate = ratePercentage / 100;
  const setting = await (prisma as any).systemSetting.upsert({
    where: { key: 'PLATFORM_COMMISSION_RATE' },
    update: { value: String(ratePercentage) },
    create: { key: 'PLATFORM_COMMISSION_RATE', value: String(ratePercentage) },
  });

  return {
    ratePercentage,
    rateDecimal: decimalRate,
    setting,
  };
};

const getCommissionTxnMap = async () => {
  const commissionTxns = await prisma.transaction.findMany({
    where: { type: 'PLATFORM_COMMISSION' },
    select: { referenceId: true, amount: true }
  });
  const map = new Map<string, number>();
  commissionTxns.forEach((tx) => {
    if (tx.referenceId) {
      map.set(tx.referenceId, tx.amount);
    }
  });
  return map;
};

const getNetHostShareForBooking = (
  booking: { id: string; totalAmount: number; paidAmount: number },
  commissionTxnMap: Map<string, number>,
  fallbackRate: number
): { platformCommission: number; netHostShare: number } => {
  let platformCommission: number;
  if (commissionTxnMap.has(booking.id)) {
    platformCommission = commissionTxnMap.get(booking.id)!;
  } else {
    platformCommission = (booking.totalAmount || booking.paidAmount) * fallbackRate;
  }
  const netHostShare = Math.max(0, booking.paidAmount - platformCommission);
  return { platformCommission, netHostShare };
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

  // Fetch approved/disbursed Advance Payout Requests
  const advanceRequests = await prisma.advancePayoutRequest.findMany({
    where: {
      status: { in: ['APPROVED', 'DISBURSED'] }
    }
  });

  const packageAdvanceMap = new Map<string, number>();
  const hotelAdvanceMap = new Map<string, number>();

  advanceRequests.forEach((req) => {
    const amt = req.disbursedAmount || req.requestedAmount;
    if (req.packageId) {
      packageAdvanceMap.set(req.packageId, (packageAdvanceMap.get(req.packageId) || 0) + amt);
    }
    if (req.hotelId) {
      hotelAdvanceMap.set(req.hotelId, (hotelAdvanceMap.get(req.hotelId) || 0) + amt);
    }
  });

  const commissionTxnMap = await getCommissionTxnMap();
  const commissionRate = await getCommissionRate();

  const bookingCalculated = confirmedBookings.map((b) => {
    const hostUser = b.package?.organizer || b.room?.hotel?.owner;
    const { platformCommission, netHostShare } = getNetHostShareForBooking(
      { id: b.id, totalAmount: b.totalAmount || b.paidAmount, paidAmount: b.paidAmount },
      commissionTxnMap,
      commissionRate
    );

    return {
      booking: b,
      hostUser,
      platformCommission,
      netHostShare,
    };
  });

  // Create mutable advance pools for FIFO allocation (oldest bookings first)
  const packageAdvancePool = new Map<string, number>(packageAdvanceMap);
  const hotelAdvancePool = new Map<string, number>(hotelAdvanceMap);

  // Sort bookings oldest first to allocate advance payouts sequentially
  const oldestFirstBookings = [...bookingCalculated].sort(
    (a, b) => new Date(a.booking.createdAt).getTime() - new Date(b.booking.createdAt).getTime()
  );

  const advanceAttributedMap = new Map<string, number>();

  for (const item of oldestFirstBookings) {
    const b = item.booking;
    let advanceAttributed = 0;

    const directDisbursed = (disbursedMap.get(b.id) || 0) + (disbursedMap.get(`FINAL_BOOKING_${b.id}`) || 0);
    const unallocatedNetShare = Math.max(0, item.netHostShare - directDisbursed);

    if (b.packageId) {
      const currentAdv = packageAdvancePool.get(b.packageId) || 0;
      if (currentAdv > 0 && unallocatedNetShare > 0) {
        advanceAttributed = Math.min(currentAdv, unallocatedNetShare);
        packageAdvancePool.set(b.packageId, currentAdv - advanceAttributed);
      }
    } else if (b.hotelId) {
      const currentAdv = hotelAdvancePool.get(b.hotelId) || 0;
      if (currentAdv > 0 && unallocatedNetShare > 0) {
        advanceAttributed = Math.min(currentAdv, unallocatedNetShare);
        hotelAdvancePool.set(b.hotelId, currentAdv - advanceAttributed);
      }
    }

    advanceAttributedMap.set(b.id, advanceAttributed);
  }

  return bookingCalculated.map(({ booking: b, hostUser, platformCommission, netHostShare }) => {
    const advanceAttributed = advanceAttributedMap.get(b.id) || 0;
    const directDisbursed = (disbursedMap.get(b.id) || 0) + (disbursedMap.get(`FINAL_BOOKING_${b.id}`) || 0);
    const isPackageFinalDisbursed = b.packageId ? disbursedMap.has(`FINAL_PKG_${b.packageId}`) : false;

    let alreadyDisbursed = directDisbursed + advanceAttributed;
    if (isPackageFinalDisbursed) {
      alreadyDisbursed = netHostShare;
    }

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

const createAdvanceRequest = async (
  userId: string,
  payload: {
    packageId?: string;
    hotelId?: string;
    roomId?: string;
    requestedAmount: number;
    reason: string;
  }
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  if (user.currentRole !== 'tour_organizer' && user.currentRole !== 'hotel_owner') {
    throw new AppError(403, 'Only Tour Organizers and Hotel Owners can submit advance requests.');
  }

  let packageId = payload.packageId || null;
  let hotelId = payload.hotelId || null;
  let roomId = payload.roomId || null;
  let totalEscrow = 0;

  if (user.currentRole === 'tour_organizer') {
    if (!packageId) {
      throw new AppError(400, 'Please select a Tour Package for your advance payout request.');
    }

    const tourPkg = await prisma.package.findUnique({
      where: { id: packageId },
    });

    if (!tourPkg || tourPkg.organizerId !== userId) {
      throw new AppError(403, 'Selected Tour Package was not found or does not belong to your account.');
    }

    const activeBookings = await prisma.booking.findMany({
      where: {
        packageId,
        bookingStatus: { not: 'CANCELLED' },
      },
    });

    const commissionTxnMap = await getCommissionTxnMap();
    const fallbackRate = await getCommissionRate();

    totalEscrow = activeBookings.reduce((sum, b) => {
      const { netHostShare } = getNetHostShareForBooking(b, commissionTxnMap, fallbackRate);
      return sum + netHostShare;
    }, 0);

    if (totalEscrow <= 0) {
      throw new AppError(400, 'No net host escrow funds are available for this tour package yet.');
    }
  } else if (user.currentRole === 'hotel_owner') {
    if (!hotelId) {
      throw new AppError(400, 'Please select a Hotel Property for your advance payout request.');
    }

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel || hotel.ownerId !== userId) {
      throw new AppError(403, 'Selected Hotel Property was not found or does not belong to your account.');
    }

    const activeBookings = await prisma.booking.findMany({
      where: {
        hotelId,
        bookingStatus: { not: 'CANCELLED' },
      },
    });

    const commissionTxnMap = await getCommissionTxnMap();
    const fallbackRate = await getCommissionRate();

    totalEscrow = activeBookings.reduce((sum, b) => {
      const { netHostShare } = getNetHostShareForBooking(b, commissionTxnMap, fallbackRate);
      return sum + netHostShare;
    }, 0);

    if (totalEscrow <= 0) {
      throw new AppError(400, 'No net host escrow funds are available for this hotel property yet.');
    }
  }

  const maxAllowableAdvance = Math.round(totalEscrow * 0.5);

  const existingAdvances = await prisma.advancePayoutRequest.aggregate({
    where: {
      userId,
      packageId: packageId || undefined,
      hotelId: hotelId || undefined,
      status: { in: ['PENDING', 'APPROVED', 'DISBURSED'] },
    },
    _sum: {
      requestedAmount: true,
    },
  });

  const totalAlreadyRequested = existingAdvances._sum.requestedAmount || 0;
  const remainingAllowable = Math.max(0, maxAllowableAdvance - totalAlreadyRequested);

  if (payload.requestedAmount > maxAllowableAdvance) {
    throw new AppError(
      400,
      `Requested advance (BDT ${payload.requestedAmount.toLocaleString()}) exceeds the 50% max limit (BDT ${maxAllowableAdvance.toLocaleString()}) for this escrow balance.`
    );
  }

  if (payload.requestedAmount > remainingAllowable) {
    throw new AppError(
      400,
      `You have already requested BDT ${totalAlreadyRequested.toLocaleString()} in advances. Maximum remaining allowable advance for this item is BDT ${remainingAllowable.toLocaleString()}.`
    );
  }

  const advanceRequest = await prisma.advancePayoutRequest.create({
    data: {
      userId,
      userRole: user.currentRole,
      packageId,
      hotelId,
      roomId,
      requestedAmount: payload.requestedAmount,
      reason: payload.reason,
      status: 'PENDING',
    },
    include: {
      package: true,
      hotel: true,
      user: {
        select: {
          fullName: true,
          email: true,
          payoutDetails: true,
        },
      },
    },
  });

  return advanceRequest;
};

const getMyAdvanceRequests = async (userId: string) => {
  const requests = await prisma.advancePayoutRequest.findMany({
    where: { userId },
    include: {
      package: true,
      hotel: true,
      room: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests;
};

const getAllAdvanceRequests = async () => {
  const requests = await prisma.advancePayoutRequest.findMany({
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          currentRole: true,
          payoutDetails: true,
        },
      },
      package: true,
      hotel: true,
      room: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests;
};

const inspectAndDisburseAdvance = async (
  requestId: string,
  payload: {
    status: 'APPROVED' | 'DISBURSED' | 'REJECTED';
    disbursedAmount?: number;
    adminNote?: string;
  }
) => {
  const request = await prisma.advancePayoutRequest.findUnique({
    where: { id: requestId },
    include: {
      user: true,
      package: true,
      hotel: true,
    },
  });

  if (!request) {
    throw new AppError(404, 'Advance payout request not found.');
  }

  if (request.status === 'DISBURSED') {
    throw new AppError(400, 'This advance payout request has already been disbursed.');
  }

  const status = payload.status;
  const adminNote = payload.adminNote || '';

  if (status === 'REJECTED') {
    const updated = await prisma.advancePayoutRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        adminNote,
      },
    });

    await prisma.notification.create({
      data: {
        userId: request.userId,
        title: 'Advance Payout Request Declined',
        message: `Your advance payout request of BDT ${request.requestedAmount.toLocaleString()} was declined. Reason: ${adminNote}`,
      },
    });

    return updated;
  }

  const finalDisbursedAmount = payload.disbursedAmount || request.requestedAmount;

  const txn = await prisma.transaction.create({
    data: {
      type: 'HOST_PAYOUT',
      amount: finalDisbursedAmount,
      receiverId: request.userId,
      referenceId: request.id,
      status: 'COMPLETED',
    },
  });

  const updated = await prisma.advancePayoutRequest.update({
    where: { id: requestId },
    data: {
      status: 'DISBURSED',
      disbursedAmount: finalDisbursedAmount,
      transactionId: txn.id,
      adminNote,
    },
  });

  const targetTitle = request.package?.title || request.hotel?.name || 'Workspace';
  await prisma.notification.create({
    data: {
      userId: request.userId,
      title: 'Advance Payout Disbursed!',
      message: `An advance disbursal of BDT ${finalDisbursedAmount.toLocaleString()} for "${targetTitle}" has been processed to your payout account. Ref Txn: ${txn.id}`,
    },
  });

  try {
    const emailBody = `
      <h1>Advance Payout Disbursed - orbitX Travel</h1>
      <p>Dear ${request.user.fullName},</p>
      <p>We have approved and processed your advance payout request for <strong>${targetTitle}</strong>.</p>
      <p><strong>Disbursed Amount:</strong> BDT ${finalDisbursedAmount.toLocaleString()}</p>
      <p><strong>Transaction Ref ID:</strong> ${txn.id}</p>
      <p><strong>Admin Note:</strong> ${adminNote || 'Approved and processed.'}</p>
      <p>Best regards,<br>orbitX Travel Financial Operations</p>
    `;
    await sendEmail(request.user.email, `Advance Payout Disbursed - ${targetTitle}`, emailBody);
  } catch (err) {
    console.error('Email notification failed:', err);
  }

  return updated;
};

const getMilestoneDisbursals = async () => {
  const now = new Date();

  const touredPackages = await prisma.package.findMany({
    where: {
      startDate: { lte: now },
    },
    include: {
      organizer: {
        select: {
          id: true,
          fullName: true,
          email: true,
          payoutDetails: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  });

  const commissionTxnMap = await getCommissionTxnMap();
  const fallbackRate = await getCommissionRate();

  const tourMilestones = await Promise.all(
    touredPackages.map(async (pkg) => {
      const activeBookings = await prisma.booking.findMany({
        where: {
          packageId: pkg.id,
          bookingStatus: { not: 'CANCELLED' },
        },
      });

      const totalEscrow = activeBookings.reduce((sum, b) => {
        const { netHostShare } = getNetHostShareForBooking(b, commissionTxnMap, fallbackRate);
        return sum + netHostShare;
      }, 0);

      const advancesAgg = await prisma.advancePayoutRequest.aggregate({
        where: {
          packageId: pkg.id,
          status: 'DISBURSED',
        },
        _sum: {
          disbursedAmount: true,
        },
      });
      const advanceDisbursed = advancesAgg._sum.disbursedAmount || 0;

      const finalTxn = await prisma.transaction.findFirst({
        where: {
          type: 'HOST_PAYOUT',
          referenceId: `FINAL_PKG_${pkg.id}`,
        },
      });

      const isFinalDisbursed = !!finalTxn;
      const netRemaining = isFinalDisbursed ? 0 : Math.max(0, totalEscrow - advanceDisbursed);

      return {
        id: pkg.id,
        title: pkg.title,
        destination: pkg.destination,
        startDate: pkg.startDate,
        organizer: pkg.organizer,
        totalEscrow,
        advanceDisbursed,
        netRemaining,
        isFinalDisbursed,
        finalTxnId: finalTxn?.id || null,
      };
    })
  );

  const hotelBookings = await prisma.booking.findMany({
    where: {
      hotelId: { not: null },
      checkInDate: { lte: now },
      bookingStatus: { not: 'CANCELLED' },
    },
    include: {
      hotel: {
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
              payoutDetails: true,
            },
          },
        },
      },
      room: true,
      traveler: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { checkInDate: 'desc' },
  });

  const hotelMilestones = await Promise.all(
    hotelBookings.map(async (b) => {
      const { netHostShare: totalEscrow } = getNetHostShareForBooking(b, commissionTxnMap, fallbackRate);

      const advancesAgg = await prisma.advancePayoutRequest.aggregate({
        where: {
          hotelId: b.hotelId!,
          status: 'DISBURSED',
        },
        _sum: {
          disbursedAmount: true,
        },
      });
      const advanceDisbursed = advancesAgg._sum.disbursedAmount || 0;

      const finalTxn = await prisma.transaction.findFirst({
        where: {
          type: 'HOST_PAYOUT',
          referenceId: `FINAL_BOOKING_${b.id}`,
        },
      });

      const isFinalDisbursed = !!finalTxn;
      const netRemaining = isFinalDisbursed ? 0 : Math.max(0, totalEscrow - advanceDisbursed);

      return {
        id: b.id,
        hotelName: b.hotel?.name || 'Hotel Property',
        roomType: b.room?.type || 'Standard Room',
        checkInDate: b.checkInDate,
        owner: b.hotel?.owner,
        traveler: b.traveler,
        totalEscrow,
        advanceDisbursed,
        netRemaining,
        isFinalDisbursed,
        finalTxnId: finalTxn?.id || null,
      };
    })
  );

  return {
    tourMilestones,
    hotelMilestones,
  };
};

const disburseFinalMilestonePayout = async (
  payload: {
    targetType: 'package' | 'booking';
    targetId: string;
  }
) => {
  const { targetType, targetId } = payload;
  const commissionTxnMap = await getCommissionTxnMap();
  const fallbackRate = await getCommissionRate();

  if (targetType === 'package') {
    const pkg = await prisma.package.findUnique({
      where: { id: targetId },
      include: { organizer: true },
    });

    if (!pkg) {
      throw new AppError(404, 'Tour package not found.');
    }

    const activeBookings = await prisma.booking.findMany({
      where: {
        packageId: targetId,
        bookingStatus: { not: 'CANCELLED' },
      },
    });

    const totalEscrow = activeBookings.reduce((sum, b) => {
      const { netHostShare } = getNetHostShareForBooking(b, commissionTxnMap, fallbackRate);
      return sum + netHostShare;
    }, 0);

    const advancesAgg = await prisma.advancePayoutRequest.aggregate({
      where: {
        packageId: targetId,
        status: 'DISBURSED',
      },
      _sum: {
        disbursedAmount: true,
      },
    });
    const advanceDisbursed = advancesAgg._sum.disbursedAmount || 0;
    const netRemaining = Math.max(0, totalEscrow - advanceDisbursed);

    if (netRemaining <= 0) {
      throw new AppError(400, 'No remaining payout balance available to disburse for this package.');
    }

    const txnRef = `FINAL_PKG_${targetId}`;
    const existingTxn = await prisma.transaction.findFirst({
      where: { type: 'HOST_PAYOUT', referenceId: txnRef },
    });

    if (existingTxn) {
      throw new AppError(400, 'Final milestone payout for this tour package has already been disbursed.');
    }

    const txn = await prisma.transaction.create({
      data: {
        type: 'HOST_PAYOUT',
        amount: netRemaining,
        receiverId: pkg.organizerId,
        referenceId: txnRef,
        status: 'COMPLETED',
      },
    });

    await prisma.notification.create({
      data: {
        userId: pkg.organizerId,
        title: 'Final Tour Payout Disbursed!',
        message: `Final remaining payout of BDT ${netRemaining.toLocaleString()} for tour "${pkg.title}" has been transferred to your account. Ref: ${txn.id}`,
      },
    });

    return txn;
  } else {
    const booking = await prisma.booking.findUnique({
      where: { id: targetId },
      include: { hotel: { include: { owner: true } } },
    });

    if (!booking || !booking.hotel) {
      throw new AppError(404, 'Hotel booking not found.');
    }

    const { netHostShare: totalEscrow } = getNetHostShareForBooking(booking, commissionTxnMap, fallbackRate);

    const advancesAgg = await prisma.advancePayoutRequest.aggregate({
      where: {
        hotelId: booking.hotelId!,
        status: 'DISBURSED',
      },
      _sum: {
        disbursedAmount: true,
      },
    });
    const advanceDisbursed = advancesAgg._sum.disbursedAmount || 0;
    const netRemaining = Math.max(0, totalEscrow - advanceDisbursed);
    const txnRef = `FINAL_BOOKING_${targetId}`;

    const existingTxn = await prisma.transaction.findFirst({
      where: { type: 'HOST_PAYOUT', referenceId: txnRef },
    });

    if (existingTxn) {
      throw new AppError(400, 'Final milestone payout for this booking has already been disbursed.');
    }

    const txn = await prisma.transaction.create({
      data: {
        type: 'HOST_PAYOUT',
        amount: netRemaining,
        receiverId: booking.hotel.ownerId,
        referenceId: txnRef,
        status: 'COMPLETED',
      },
    });

    await prisma.notification.create({
      data: {
        userId: booking.hotel.ownerId,
        title: 'Hotel Stay Payout Disbursed!',
        message: `Final payout of BDT ${netRemaining.toLocaleString()} for hotel reservation (${booking.hotel.name}) has been transferred. Ref: ${txn.id}`,
      },
    });

    return txn;
  }
};

export const AdminService = {
  getCommissionRate,
  getCommissionRateInfo,
  updateCommissionRate,
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
  createAdvanceRequest,
  getMyAdvanceRequests,
  getAllAdvanceRequests,
  inspectAndDisburseAdvance,
  getMilestoneDisbursals,
  disburseFinalMilestonePayout,
};
