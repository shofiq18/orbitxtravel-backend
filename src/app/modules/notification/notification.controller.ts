import { Request, Response } from 'express';
import { NotificationService } from './notification.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const getNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await NotificationService.getNotifications(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications retrieved successfully.',
    data: result,
  });
});

const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const result = await NotificationService.markAsRead(userId, id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification marked as read successfully.',
    data: result,
  });
});

export const NotificationController = {
  getNotifications,
  markAsRead,
};
