import { Request, Response } from 'express';
import { TourService } from './tour.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const createPackage = catchAsync(async (req: Request, res: Response) => {
  const organizerId = (req as any).user.id;
  const result = await TourService.createPackage(organizerId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Tour package and inclusions created successfully.',
    data: result,
  });
});

const getPackages = catchAsync(async (req: Request, res: Response) => {
  const filters = {
    destination: req.query.destination as string,
    minPrice: req.query.minPrice as string,
    maxPrice: req.query.maxPrice as string,
    verifiedOnly: req.query.verifiedOnly as string,
    startDate: req.query.startDate as string,
  };
  const result = await TourService.getPackages(filters);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tour packages retrieved successfully.',
    data: result,
  });
});

const getPackageById = catchAsync(async (req: Request, res: Response) => {
  const result = await TourService.getPackageById(req.params.id as string);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tour package details retrieved successfully.',
    data: result,
  });
});

export const TourController = {
  createPackage,
  getPackages,
  getPackageById,
};
