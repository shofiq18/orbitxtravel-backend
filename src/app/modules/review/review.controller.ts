import { Request, Response } from 'express';
import { ReviewService } from './review.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const createReview = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await ReviewService.createReview(userId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Review posted successfully.',
    data: result,
  });
});

const getReviewsByHotelId = catchAsync(async (req: Request, res: Response) => {
  const { hotelId } = req.params;
  const result = await ReviewService.getReviewsByHotelId(hotelId as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reviews retrieved successfully.',
    data: result,
  });
});

const getAllReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.getAllReviews();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All traveler reviews retrieved successfully.',
    data: result,
  });
});

export const ReviewController = {
  createReview,
  getReviewsByHotelId,
  getAllReviews,
};
