import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';

const getNotifications = async (userId: string) => {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return notifications;
};

const markAsRead = async (userId: string, id: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id },
  });

  if (!notification) {
    throw new AppError(404, 'Notification not found.');
  }

  if (notification.userId !== userId) {
    throw new AppError(403, 'Forbidden: You do not own this notification.');
  }

  const updatedNotification = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  return updatedNotification;
};

export const NotificationService = {
  getNotifications,
  markAsRead,
};
