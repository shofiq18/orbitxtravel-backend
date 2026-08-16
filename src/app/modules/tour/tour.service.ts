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
    itinerary,
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
        itinerary: itinerary || [],
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
  organizerId?: string;
}) => {
  const whereConditions: any = {};

  if (filters.organizerId) {
    whereConditions.organizerId = filters.organizerId;
  }

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
  // Skip this check if looking up packages for a specific organizer (they need to see all their tours)
  if (!filters.organizerId) {
    whereConditions.startDate = {
      ...whereConditions.startDate,
      gte: new Date(),
    };
  }

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

  // Dynamically compute availableSeats for each package based on active bookings
  const packagesWithSeats = await Promise.all(
    packages.map(async (pkg) => {
      const bookingsAgg = await prisma.booking.aggregate({
        where: {
          packageId: pkg.id,
          bookingStatus: { not: 'CANCELLED' },
        },
        _sum: {
          seatsBooked: true,
        },
      });
      const bookedCount = bookingsAgg._sum.seatsBooked || 0;
      const availableSeats = Math.max(0, pkg.maxSeats - bookedCount);

      if (pkg.availableSeats !== availableSeats) {
        await prisma.package.update({
          where: { id: pkg.id },
          data: { availableSeats },
        }).catch(() => {});
      }

      return {
        ...pkg,
        availableSeats,
      };
    })
  );

  return packagesWithSeats;
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

  const bookingsAgg = await prisma.booking.aggregate({
    where: {
      packageId: id,
      bookingStatus: { not: 'CANCELLED' },
    },
    _sum: {
      seatsBooked: true,
    },
  });
  const bookedCount = bookingsAgg._sum.seatsBooked || 0;
  const availableSeats = Math.max(0, tourPackage.maxSeats - bookedCount);

  if (tourPackage.availableSeats !== availableSeats) {
    await prisma.package.update({
      where: { id },
      data: { availableSeats },
    }).catch(() => {});
  }

  return {
    ...tourPackage,
    availableSeats,
  };
};

const updatePackage = async (id: string, organizerId: string, payload: any) => {
  const tourPackage = await prisma.package.findUnique({
    where: { id },
  });

  if (!tourPackage) {
    throw new AppError(404, 'Tour package not found.');
  }

  if (tourPackage.organizerId !== organizerId) {
    throw new AppError(403, 'Forbidden: You do not own this tour package.');
  }

  const {
    title,
    destination,
    startDate,
    endDate,
    maxSeats,
    inclusions,
    totalPackagePrice,
    minimumSeatLockFee,
    itinerary,
  } = payload;

  let calculatedAvailableSeats = undefined;
  if (maxSeats !== undefined) {
    const bookedSeatsCount = await prisma.booking.aggregate({
      where: {
        packageId: id,
        paymentStatus: 'PAID',
      },
      _sum: {
        seatsBooked: true,
      },
    });
    const totalBooked = bookedSeatsCount._sum.seatsBooked || 0;
    calculatedAvailableSeats = Math.max(0, Number(maxSeats) - totalBooked);
  }

  const result = await prisma.package.update({
    where: { id },
    data: {
      title,
      destination,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      maxSeats: maxSeats !== undefined ? Number(maxSeats) : undefined,
      availableSeats: calculatedAvailableSeats,
      inclusions,
      totalPackagePrice: totalPackagePrice !== undefined ? Number(totalPackagePrice) : undefined,
      minimumSeatLockFee: minimumSeatLockFee !== undefined ? Number(minimumSeatLockFee) : undefined,
      itinerary: itinerary || undefined,
    },
  });

  return result;
};

const deletePackage = async (id: string, organizerId: string) => {
  const tourPackage = await prisma.package.findUnique({
    where: { id },
  });

  if (!tourPackage) {
    throw new AppError(404, 'Tour package not found.');
  }

  if (tourPackage.organizerId !== organizerId) {
    throw new AppError(403, 'Forbidden: You do not own this tour package.');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Release/Delete associated room locks
    await tx.roomLock.deleteMany({
      where: { packageId: id },
    });

    // 2. Delete associated bookings
    await tx.booking.deleteMany({
      where: { packageId: id },
    });

    // 3. Delete the package
    await tx.package.delete({
      where: { id },
    });
  });

  return { success: true, message: 'Tour package and all associated holds/bookings deleted successfully.' };
};

export const TourService = {
  createPackage,
  getPackages,
  getPackageById,
  updatePackage,
  deletePackage,
};
