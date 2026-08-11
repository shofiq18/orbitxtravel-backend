import { Request, Response } from 'express';
import { AdminService } from './admin.service.js';
import { BookingService } from '../booking/booking.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const getVendorsQueue = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getVendorsQueue();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Vendor onboarding queue retrieved successfully.',
    data: result,
  });
});

const verifyVendor = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { isVerified } = req.body;
  const result = await AdminService.verifyVendor(userId as string, isVerified);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Vendor verification status updated to: ${isVerified ? 'VERIFIED' : 'REJECTED'}.`,
    data: result,
  });
});

const getCommissions = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getPlatformCommissions();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Platform commission transactions retrieved successfully.',
    data: result,
  });
});

const getPayouts = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getPayouts();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Host payout transactions retrieved successfully.',
    data: result,
  });
});

const releasePayout = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.releasePayout(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Payout released and logged successfully.',
    data: result,
  });
});

const triggerPreTripAlerts = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingService.sendPreTripSMSAlerts();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Pre-trip alerts scanned successfully. Dispatched ${result.sentCount} SMS reminders.`,
    data: result,
  });
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllUsers();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All users retrieved successfully.',
    data: result,
  });
});

const toggleSuspendUser = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { isSuspended } = req.body;
  const result = await AdminService.toggleSuspendUser(userId as string, isSuspended);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `User suspension status updated to: ${isSuspended ? 'SUSPENDED' : 'ACTIVE'}.`,
    data: result,
  });
});

export const AdminController = {
  getVendorsQueue,
  verifyVendor,
  getCommissions,
  getPayouts,
  releasePayout,
  triggerPreTripAlerts,
  getAllUsers,
  toggleSuspendUser,
};
