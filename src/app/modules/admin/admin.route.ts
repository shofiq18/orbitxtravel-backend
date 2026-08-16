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
router.get('/commission-rate', auth('admin'), AdminController.getCommissionRate);
router.patch(
  '/commission-rate',
  auth('admin'),
  validateRequest(AdminValidation.updateCommissionRateSchema),
  AdminController.updateCommissionRate
);
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

// Advance Payout Request Routes
router.post('/advance-requests', auth('tour_organizer', 'hotel_owner'), AdminController.createAdvanceRequest);
router.get('/advance-requests/my', auth('tour_organizer', 'hotel_owner'), AdminController.getMyAdvanceRequests);
router.get('/advance-requests/all', auth('admin'), AdminController.getAllAdvanceRequests);
router.patch('/advance-requests/:id/disburse', auth('admin'), AdminController.inspectAndDisburseAdvance);

// Milestone Disbursal Routes
router.get('/milestones/disbursals', auth('admin'), AdminController.getMilestoneDisbursals);
router.post('/milestones/disburse-final', auth('admin'), AdminController.disburseFinalMilestonePayout);

export const AdminRoutes = router;
