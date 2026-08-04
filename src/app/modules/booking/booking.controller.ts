import { Request, Response } from 'express';
import { BookingService } from './booking.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const createBooking = catchAsync(async (req: Request, res: Response) => {
  const travelerId = (req as any).user.id;
  const result = await BookingService.createBooking(travelerId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Booking initiated. Please lock your seats by completing the deposit checkout.',
    data: result,
  });
});

const payBooking = catchAsync(async (req: Request, res: Response) => {
  const travelerId = (req as any).user.id;
  const { id } = req.params;
  const result = await BookingService.payBooking(travelerId, id as string, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Seat lock payment received. Booking confirmed.',
    data: result,
  });
});

const getBookings = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const role = (req as any).user.currentRole;
  const result = await BookingService.getBookingsByUser(userId, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Bookings retrieved successfully.',
    data: result,
  });
});

const getBookingById = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const role = (req as any).user.currentRole;
  const { id } = req.params;
  const result = await BookingService.getBookingById(userId, role, id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Booking details retrieved successfully.',
    data: result,
  });
});

export const BookingController = {
  createBooking,
  payBooking,
  getBookings,
  getBookingById,
};
