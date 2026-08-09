import { Request, Response } from 'express';
import { HotelService } from './hotel.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';
import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../../../config/index.js';

// Helper to extract requester's active role if token exists (non-blocking)
const getRequesterRole = (req: Request): string | undefined => {
  let token = req.headers.authorization;
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (token && token.startsWith('Bearer ')) {
    token = token.split(' ')[1];
  }
  if (!token) return undefined;

  try {
    const decoded = jwt.verify(token, config.jwt_secret) as JwtPayload;
    return decoded.currentRole;
  } catch (err) {
    return undefined;
  }
};

const createHotel = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await HotelService.createHotel(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Hotel listed successfully.',
    data: result,
  });
});

const getHotels = catchAsync(async (req: Request, res: Response) => {
  const filters = {
    address: req.query.address as string,
    verifiedOnly: req.query.verifiedOnly as string,
    ownerId: req.query.ownerId as string,
  };
  const result = await HotelService.getHotels(filters);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Hotels retrieved successfully.',
    data: result,
  });
});

const getHotelById = catchAsync(async (req: Request, res: Response) => {
  const role = getRequesterRole(req);
  const result = await HotelService.getHotelById(req.params.id as string, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Hotel details retrieved successfully.',
    data: result,
  });
});

const createRoom = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { hotelId } = req.params;
  const result = await HotelService.createRoom(userId, hotelId as string, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Room listed successfully.',
    data: result,
  });
});

const getRooms = catchAsync(async (req: Request, res: Response) => {
  const { hotelId } = req.params;
  const role = getRequesterRole(req);
  const result = await HotelService.getRoomsByHotelId(hotelId as string, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Rooms retrieved successfully.',
    data: result,
  });
});

const blockRoomDates = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { roomId } = req.params;
  const result = await HotelService.blockDates(userId, roomId as string, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.blockedRecords,
  });
});

const getBlockedRoomDates = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const result = await HotelService.getBlockedDates(roomId as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Blocked dates retrieved successfully.',
    data: result,
  });
});

const updateHotel = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const result = await HotelService.updateHotel(userId, id as string, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Hotel listed policies updated successfully.',
    data: result,
  });
});

export const HotelController = {
  createHotel,
  getHotels,
  getHotelById,
  createRoom,
  getRooms,
  blockRoomDates,
  getBlockedRoomDates,
  updateHotel,
};
