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

const getPendingPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getPendingPayments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Pending bKash payment verification requests retrieved successfully.',
    data: result,
  });
});

const verifyPayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId } = req.params;
  const { action, reason } = req.body;
  const result = await AdminService.verifyPayment(bookingId as string, action, reason);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Payment verification status updated: ${action}.`,
    data: result,
  });
});

const getEscrowBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getEscrowBookings();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Escrow held bookings retrieved successfully.',
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
    message: `Pre-trip alerts scanned successfully. Dispatched ${result.sentCount} email reminders.`,
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

const createAdvanceRequest = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const result = await AdminService.createAdvanceRequest(userId as string, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Advance payout request submitted successfully to Admin for review.',
    data: result,
  });
});

const getMyAdvanceRequests = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const result = await AdminService.getMyAdvanceRequests(userId as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My advance payout requests retrieved successfully.',
    data: result,
  });
});

const getAllAdvanceRequests = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllAdvanceRequests();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All advance payout requests retrieved successfully.',
    data: result,
  });
});

const inspectAndDisburseAdvance = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.inspectAndDisburseAdvance(id as string, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Advance request status updated to: ${req.body.status}.`,
    data: result,
  });
});

const getMilestoneDisbursals = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getMilestoneDisbursals();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Milestone disbursal targets retrieved successfully.',
    data: result,
  });
});

const disburseFinalMilestonePayout = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.disburseFinalMilestonePayout(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Final milestone payout disbursed successfully.',
    data: result,
  });
});

const getCommissionRate = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getCommissionRateInfo();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Commission rate retrieved successfully.',
    data: result,
  });
});

const updateCommissionRate = catchAsync(async (req: Request, res: Response) => {
  const { ratePercentage } = req.body;
  const result = await AdminService.updateCommissionRate(Number(ratePercentage));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Commission rate updated successfully to ${ratePercentage}%.`,
    data: result,
  });
});

export const AdminController = {
  getCommissionRate,
  updateCommissionRate,
  getVendorsQueue,
  verifyVendor,
  getPendingPayments,
  verifyPayment,
  getEscrowBookings,
  getCommissions,
  getPayouts,
  releasePayout,
  triggerPreTripAlerts,
  getAllUsers,
  toggleSuspendUser,
  createAdvanceRequest,
  getMyAdvanceRequests,
  getAllAdvanceRequests,
  inspectAndDisburseAdvance,
  getMilestoneDisbursals,
  disburseFinalMilestonePayout,
};
