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

export const TourRoutes = router;
