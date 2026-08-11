import express from 'express';
import { TourController } from './tour.controller.js';
import { TourValidation } from './tour.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.post(
  '/',
  auth('tour_organizer'),
  validateRequest(TourValidation.createPackageSchema),
  TourController.createPackage
);

router.get('/', TourController.getPackages);
router.get('/:id', TourController.getPackageById);

router.patch(
  '/:id',
  auth('tour_organizer'),
  validateRequest(TourValidation.updatePackageSchema),
  TourController.updatePackage
);

router.delete(
  '/:id',
  auth('tour_organizer'),
  TourController.deletePackage
);

export const TourRoutes = router;
