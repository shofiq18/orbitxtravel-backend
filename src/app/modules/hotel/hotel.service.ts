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

const getHotels = async (filters: { address?: string; verifiedOnly?: string }) => {
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

export const HotelService = {
  createHotel,
  getHotels,
  getHotelById,
  createRoom,
  getRoomsByHotelId,
  blockDates,
  getBlockedDates,
};
