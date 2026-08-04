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

router.get('/commissions', auth('admin'), AdminController.getCommissions);
router.get('/payouts', auth('admin'), AdminController.getPayouts);
router.post(
  '/payouts/release',
  auth('admin'),
  validateRequest(AdminValidation.releasePayoutSchema),
  AdminController.releasePayout
);

router.post('/pretrip-alerts', auth('admin'), AdminController.triggerPreTripAlerts);

export const AdminRoutes = router;
