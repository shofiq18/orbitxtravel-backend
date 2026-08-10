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
  const hotelId = req.params.hotelId as string;
  const result = await ReviewService.getReviewsByHotelId(hotelId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reviews retrieved successfully.',
    data: result,
  });
});

export const ReviewController = {
  createReview,
  getReviewsByHotelId
};
