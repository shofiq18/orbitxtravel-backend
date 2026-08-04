import express from 'express';
import { NotificationController } from './notification.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.get('/', auth(), NotificationController.getNotifications);
router.patch('/:id/read', auth(), NotificationController.markAsRead);

export const NotificationRoutes = router;
