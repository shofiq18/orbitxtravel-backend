import express from 'express';
import { AdminController } from './admin.controller.js';
import { AdminValidation } from './admin.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.get('/vendors', auth('admin'), AdminController.getVendorsQueue);
router.patch(
  '/vendors/:userId/verify',
  auth('admin'),
  validateRequest(AdminValidation.verifyVendorSchema),
  AdminController.verifyVendor
);

router.get('/pending-payments', auth('admin'), AdminController.getPendingPayments);
router.patch(
  '/verify-payment/:bookingId',
  auth('admin'),
  validateRequest(AdminValidation.verifyPaymentSchema),
  AdminController.verifyPayment
);

router.get('/escrow-bookings', auth('admin'), AdminController.getEscrowBookings);
router.get('/commissions', auth('admin'), AdminController.getCommissions);
router.get('/payouts', auth('admin'), AdminController.getPayouts);
router.post(
  '/payouts/release',
  auth('admin'),
  validateRequest(AdminValidation.releasePayoutSchema),
  AdminController.releasePayout
);

router.get('/users', auth('admin'), AdminController.getAllUsers);
router.patch(
  '/users/:userId/suspend',
  auth('admin'),
  validateRequest(AdminValidation.suspendUserSchema),
  AdminController.toggleSuspendUser
);

router.post('/pretrip-alerts', auth('admin'), AdminController.triggerPreTripAlerts);

export const AdminRoutes = router;
