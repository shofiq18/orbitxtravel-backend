import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';

const createPackage = async (organizerId: string, payload: any) => {
  const {
    title,
    destination,
    startDate,
    endDate,
    maxSeats,
    inclusions,
    totalPackagePrice,
    minimumSeatLockFee,
    lockedRooms,
  } = payload;

  const user = await prisma.user.findUnique({ where: { id: organizerId } });
  if (!user) {
    throw new AppError(404, 'Organizer user not found.');
  }

  // Create the package in a transaction to handle room locks cleanly
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the package
    const tourPackage = await tx.package.create({
      data: {
        organizerId,
        title,
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxSeats,
        availableSeats: maxSeats,
        inclusions,
        totalPackagePrice,
        minimumSeatLockFee,
        isVerified: user.isVerified, // Matches organizer verification status
      },
    });

    // 2. Handle room locks if specified
    if (lockedRooms && lockedRooms.length > 0) {
      for (const lock of lockedRooms) {
        const room = await tx.room.findUnique({
          where: { id: lock.roomId },
        });

        if (!room) {
          throw new AppError(404, `Room ID ${lock.roomId} not found.`);
        }

        // Calculate nights
        const checkIn = new Date(lock.checkInDate);
        const checkOut = new Date(lock.checkOutDate);
        const diffTime = checkOut.getTime() - checkIn.getTime();
        const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (nights <= 0) {
          throw new AppError(400, 'Check-out date must be after check-in date.');
        }

        // Validate inventory bounds:
        // total room inventory - active blocks on dates - active locks on dates
        const blockedCount = await tx.blockedDate.count({
          where: {
            roomId: lock.roomId,
            date: {
              gte: checkIn,
              lte: checkOut,
            },
          },
        });

        if (blockedCount > 0) {
          throw new AppError(400, `Selected room has blocked dates during the requested hold interval.`);
        }

        // Active locks on overlapping dates
        const activeLocks = await tx.roomLock.findMany({
          where: {
            roomId: lock.roomId,
            status: 'LOCKED',
            expiresAt: { gte: new Date() },
            OR: [
              {
                checkInDate: { lte: checkOut },
                checkOutDate: { gte: checkIn },
              },
            ],
          },
        });

        const activeLocksCount = activeLocks.reduce((acc, curr) => acc + curr.quantity, 0);

        if (room.inventory - activeLocksCount < lock.quantity) {
          throw new AppError(
            400,
            `Not enough rooms available for B2B lock. Available: ${
              room.inventory - activeLocksCount
            }, Requested: ${lock.quantity}`
          );
        }

        const totalPrice = room.b2bPrice * lock.quantity * nights;

        // Set lock expiry to 24 hours from now
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await tx.roomLock.create({
          data: {
            packageId: tourPackage.id,
            roomId: lock.roomId,
            quantity: lock.quantity,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            totalPrice,
            status: 'LOCKED',
            expiresAt,
          },
        });
      }
    }

    return tourPackage;
  });

  // Fetch created package with details
  const completePackage = await prisma.package.findUnique({
    where: { id: result.id },
    include: {
      lockedRooms: {
        include: {
          room: {
            include: {
              hotel: true,
            },
          },
        },
      },
    },
  });

  return completePackage;
};

const getPackages = async (filters: {
  destination?: string;
  minPrice?: string;
  maxPrice?: string;
  verifiedOnly?: string;
  startDate?: string;
}) => {
  const whereConditions: any = {};

  if (filters.destination) {
    whereConditions.destination = {
      contains: filters.destination,
      mode: 'insensitive',
    };
  }

  if (filters.minPrice || filters.maxPrice) {
    whereConditions.totalPackagePrice = {};
    if (filters.minPrice) {
      whereConditions.totalPackagePrice.gte = Number(filters.minPrice);
    }
    if (filters.maxPrice) {
      whereConditions.totalPackagePrice.lte = Number(filters.maxPrice);
    }
  }

  if (filters.verifiedOnly === 'true') {
    whereConditions.isVerified = true;
  }

  if (filters.startDate) {
    whereConditions.startDate = {
      gte: new Date(filters.startDate),
    };
  }

  // Active packages filter (only show packages that haven't departed yet)
  whereConditions.startDate = {
    ...whereConditions.startDate,
    gte: new Date(),
  };

  const packages = await prisma.package.findMany({
    where: whereConditions,
    include: {
      organizer: {
        select: {
          fullName: true,
          email: true,
          isVerified: true,
        },
      },
    },
    orderBy: {
      startDate: 'asc',
    },
  });

  return packages;
};

const getPackageById = async (id: string) => {
  // Clean up any expired locks on retrieve dynamically (lazy cleanup)
  await prisma.roomLock.updateMany({
    where: {
      packageId: id,
      status: 'LOCKED',
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'RELEASED',
    },
  });

  const tourPackage = await prisma.package.findUnique({
    where: { id },
    include: {
      organizer: {
        select: {
          fullName: true,
          email: true,
          isVerified: true,
        },
      },
      lockedRooms: {
        where: {
          status: 'LOCKED', // Only show active holds
        },
        include: {
          room: {
            include: {
              hotel: true,
            },
          },
        },
      },
    },
  });

  if (!tourPackage) {
    throw new AppError(404, 'Tour package not found.');
  }

  return tourPackage;
};

export const TourService = {
  createPackage,
  getPackages,
  getPackageById,
};
