import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';

const createHotel = async (userId: string, payload: any) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  // Create the hotel listing
  const hotel = await prisma.hotel.create({
    data: {
      ...payload,
      ownerId: userId,
      isVerified: user.isVerified, // Matches owner's verification status
    },
  });

  return hotel;
};

const getHotels = async (filters: { address?: string; verifiedOnly?: string; ownerId?: string }) => {
  const whereConditions: any = {};

  if (filters.address) {
    whereConditions.address = {
      contains: filters.address,
      mode: 'insensitive',
    };
  }

  if (filters.verifiedOnly === 'true') {
    whereConditions.isVerified = true;
  }

  if (filters.ownerId) {
    whereConditions.ownerId = filters.ownerId;
  }

  const hotels = await prisma.hotel.findMany({
    where: whereConditions,
    include: {
      owner: {
        select: {
          fullName: true,
          email: true,
          isVerified: true,
        },
      },
      rooms: true,
    },
  });

  return hotels;
};

const getHotelById = async (id: string, requesterRole?: string) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          fullName: true,
          email: true,
          isVerified: true,
        },
      },
      rooms: true,
    },
  });

  if (!hotel) {
    throw new AppError(404, 'Hotel not found.');
  }

  // Dual-tier pricing restriction:
  // If the requester is NOT a verified tour organizer or admin,
  // we must redact/hide the B2B wholesale prices from the room listings!
  const isAuthorizedForB2B =
    requesterRole === 'tour_organizer' || requesterRole === 'admin';

  if (!isAuthorizedForB2B && hotel.rooms.length > 0) {
    hotel.rooms = hotel.rooms.map((room) => {
      const roomCopy = { ...room } as any;
      delete roomCopy.b2bPrice; // Strip the wholesale B2B rate
      return roomCopy;
    });
  }

  return hotel;
};

const createRoom = async (userId: string, hotelId: string, payload: any) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) {
    throw new AppError(404, 'Hotel not found.');
  }

  if (hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own this hotel listing.');
  }

  const room = await prisma.room.create({
    data: {
      ...payload,
      hotelId,
    },
  });

  return room;
};

const getRoomsByHotelId = async (hotelId: string, requesterRole?: string) => {
  const rooms = await prisma.room.findMany({
    where: { hotelId },
  });

  const isAuthorizedForB2B =
    requesterRole === 'tour_organizer' || requesterRole === 'admin';

  if (!isAuthorizedForB2B && rooms.length > 0) {
    return rooms.map((room) => {
      const roomCopy = { ...room } as any;
      delete roomCopy.b2bPrice;
      return roomCopy;
    });
  }

  return rooms;
};

const blockDates = async (userId: string, roomId: string, payload: { dates: string[]; reason?: string }) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: true },
  });

  if (!room) {
    throw new AppError(404, 'Room not found.');
  }

  if (room.hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own the hotel associated with this room.');
  }

  const blockedRecords = [];

  for (const dateString of payload.dates) {
    const targetDate = new Date(dateString);
    
    // Check if already blocked
    const existingBlock = await prisma.blockedDate.findFirst({
      where: {
        roomId,
        date: targetDate,
      },
    });

    if (!existingBlock) {
      const blockedRecord = await prisma.blockedDate.create({
        data: {
          roomId,
          date: targetDate,
          reason: payload.reason || 'Offline booking lock',
        },
      });
      blockedRecords.push(blockedRecord);
    }
  }

  return {
    message: `Successfully blocked ${blockedRecords.length} dates for this room.`,
    blockedRecords,
  };
};

const getBlockedDates = async (roomId: string) => {
  const blockedDates = await prisma.blockedDate.findMany({
    where: { roomId },
    orderBy: { date: 'asc' },
  });
  return blockedDates;
};

const updateHotel = async (userId: string, hotelId: string, payload: any) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) {
    throw new AppError(404, 'Hotel not found.');
  }

  if (hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own this hotel listing.');
  }

  const updatedHotel = await prisma.hotel.update({
    where: { id: hotelId },
    data: payload,
  });

  return updatedHotel;
};

const getRoomAvailability = async (roomId: string, checkInDate: string, checkOutDate: string) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw new AppError(404, 'Room not found.');
  }

  if (!checkInDate || !checkOutDate) {
    return {
      roomId,
      totalInventory: room.inventory,
      bookedQuantity: 0,
      remainingInventory: room.inventory,
    };
  }

  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  // Check bookings overlapping this range
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

  return {
    roomId,
    totalInventory: room.inventory,
    bookedQuantity,
    remainingInventory,
  };
};

const deleteHotel = async (userId: string, hotelId: string) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) {
    throw new AppError(404, 'Hotel not found.');
  }

  if (hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own this hotel listing.');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Get room IDs associated with this hotel
    const rooms = await tx.room.findMany({ where: { hotelId } });
    const roomIds = rooms.map(r => r.id);

    // 2. Delete blocked dates
    await tx.blockedDate.deleteMany({
      where: { roomId: { in: roomIds } }
    });

    // 3. Delete room locks
    await tx.roomLock.deleteMany({
      where: { roomId: { in: roomIds } }
    });

    // 4. Delete bookings associated with rooms in this hotel
    await tx.booking.deleteMany({
      where: { roomId: { in: roomIds } }
    });

    // 5. Delete rooms
    await tx.room.deleteMany({
      where: { hotelId }
    });

    // 6. Delete the hotel
    await tx.hotel.delete({
      where: { id: hotelId }
    });
  });

  return { success: true, message: 'Hotel and associated rooms/holds/bookings deleted successfully.' };
};

const updateRoom = async (userId: string, roomId: string, payload: any) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: true },
  });

  if (!room) {
    throw new AppError(404, 'Room not found.');
  }

  if (room.hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own the hotel associated with this room.');
  }

  const updatedRoom = await prisma.room.update({
    where: { id: roomId },
    data: payload,
  });

  return updatedRoom;
};

const deleteRoom = async (userId: string, roomId: string) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { hotel: true },
  });

  if (!room) {
    throw new AppError(404, 'Room not found.');
  }

  if (room.hotel.ownerId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own the hotel associated with this room.');
  }

  await prisma.room.delete({
    where: { id: roomId },
  });

  return { success: true, message: 'Room deleted successfully.' };
};

export const HotelService = {
  createHotel,
  getHotels,
  getHotelById,
  createRoom,
  getRoomsByHotelId,
  blockDates,
  getBlockedDates,
  updateHotel,
  getRoomAvailability,
  deleteHotel,
  updateRoom,
  deleteRoom,
};
