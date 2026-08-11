import { z } from 'zod';

const createHotelSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Hotel name is required'),
    address: z.string().min(5, 'Hotel address is required'),
    description: z.string().optional(),
    amenities: z.array(z.string()).default([]),
    photos: z.array(z.string().url()).default([]),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
  }),
});

const createRoomSchema = z.object({
  body: z.object({
    type: z.string().min(2, 'Room type is required (e.g. Deluxe Suite)'),
    amenities: z.array(z.string()).default([]),
    photos: z.array(z.string().url()).default([]),
    inventory: z.number().int().nonnegative('Inventory must be a positive integer'),
    b2cPrice: z.number().positive('B2C public price must be a positive number'),
    b2bPrice: z.number().positive('B2B wholesale price must be a positive number'),
  }),
});

const blockDatesSchema = z.object({
  body: z.object({
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')),
    reason: z.string().optional(),
  }),
});

const updateHotelSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Hotel name is required').optional(),
    address: z.string().min(5, 'Hotel address is required').optional(),
    description: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    photos: z.array(z.string().url()).optional(),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
  }),
});

const updateRoomSchema = z.object({
  body: z.object({
    type: z.string().min(2, 'Room type is required (e.g. Deluxe Suite)').optional(),
    amenities: z.array(z.string()).optional(),
    photos: z.array(z.string().url()).optional(),
    inventory: z.number().int().nonnegative('Inventory must be a positive integer').optional(),
    b2cPrice: z.number().positive('B2C public price must be a positive number').optional(),
    b2bPrice: z.number().positive('B2B wholesale price must be a positive number').optional(),
  }),
});

export const HotelValidation = {
  createHotelSchema,
  updateHotelSchema,
  createRoomSchema,
  updateRoomSchema,
  blockDatesSchema,
};
