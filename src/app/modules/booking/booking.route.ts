import express from 'express';
import { BookingController } from './booking.controller.js';
import { BookingValidation } from './booking.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.post(
  '/',
  auth('traveler'),
  validateRequest(BookingValidation.createBookingSchema),
  BookingController.createBooking
);

router.post(
  '/:id/pay-simulate',
  auth('traveler'),
  validateRequest(BookingValidation.payBookingSchema),
  BookingController.payBooking
);

router.get('/', auth(), BookingController.getBookings);
router.get('/:id', auth(), BookingController.getBookingById);

export const BookingRoutes = router;
