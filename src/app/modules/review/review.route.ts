import express from 'express';
import { ReviewController } from './review.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.post(
  '/',
  auth('traveler', 'hotel_owner', 'tour_organizer', 'admin'),
  ReviewController.createReview
);

router.get(
  '/:hotelId',
  ReviewController.getReviewsByHotelId
);

export const ReviewRoutes = router;
