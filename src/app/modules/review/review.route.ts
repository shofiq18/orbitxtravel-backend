import express from 'express';
import { ReviewController } from './review.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

router.get('/', ReviewController.getAllReviews);
router.post('/', auth(), ReviewController.createReview);
router.get('/hotel/:hotelId', ReviewController.getReviewsByHotelId);

export const ReviewRoutes = router;
