import { z } from 'zod';

const lockedRoomItemSchema = z.object({
  roomId: z.string().uuid('Invalid Room ID'),
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-in date must be YYYY-MM-DD'),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-out date must be YYYY-MM-DD'),
});

const createPackageSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title is too short'),
    destination: z.string().min(2, 'Destination is required'),
    startDate: z.string().datetime('Start date must be a valid ISO datetime string'),
    endDate: z.string().datetime('End date must be a valid ISO datetime string'),
    maxSeats: z.number().int().positive('Max seats must be a positive number'),
    inclusions: z.object({
      transport: z.string().min(2, 'Transport description is required'),
      stayType: z.string().min(2, 'Stay description is required'),
      mealPlan: z.string().min(2, 'Meal plan is required'),
      customs: z.array(z.string()).default([]),
      coverImage: z.string().url('Cover image must be a valid URL').optional(),
      photos: z.array(z.string().url()).optional(),
    }),
    totalPackagePrice: z.number().positive('Total package price must be positive'),
    minimumSeatLockFee: z.number().positive('Minimum seat lock fee must be positive'),
    itinerary: z.array(z.object({
      day: z.number().int().positive(),
      title: z.string().min(2, 'Itinerary title is too short'),
      description: z.string().min(5, 'Itinerary description is too short'),
      image: z.string().url('Itinerary image must be a valid URL').optional().or(z.literal('')),
    })).optional(),
    lockedRooms: z.array(lockedRoomItemSchema).optional(),
  }),
});

const updatePackageSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title is too short').optional(),
    destination: z.string().min(2, 'Destination is required').optional(),
    startDate: z.string().datetime('Start date must be a valid ISO datetime string').optional(),
    endDate: z.string().datetime('End date must be a valid ISO datetime string').optional(),
    maxSeats: z.number().int().positive('Max seats must be a positive number').optional(),
    inclusions: z.object({
      transport: z.string().min(2, 'Transport description is required').optional(),
      stayType: z.string().min(2, 'Stay description is required').optional(),
      mealPlan: z.string().min(2, 'Meal plan is required').optional(),
      customs: z.array(z.string()).optional(),
      coverImage: z.string().url('Cover image must be a valid URL').optional(),
      photos: z.array(z.string().url()).optional(),
    }).optional(),
    totalPackagePrice: z.number().positive('Total package price must be positive').optional(),
    minimumSeatLockFee: z.number().positive('Minimum seat lock fee must be positive').optional(),
    itinerary: z.array(z.object({
      day: z.number().int().positive(),
      title: z.string().min(2, 'Itinerary title is too short'),
      description: z.string().min(5, 'Itinerary description is too short'),
      image: z.string().url('Itinerary image must be a valid URL').optional().or(z.literal('')),
    })).optional(),
    lockedRooms: z.array(lockedRoomItemSchema).optional(),
  }),
});

export const TourValidation = {
  createPackageSchema,
  updatePackageSchema,
};
