import { z } from 'zod';

const createBookingSchema = z.object({
  body: z.object({
    packageId: z.string().uuid('Invalid Package ID'),
    seatsBooked: z.number().int().positive('Seats booked must be at least 1'),
  }),
});

const payBookingSchema = z.object({
  body: z.object({
    paymentMethod: z.enum(['bkash', 'nagad', 'card']),
  }),
});

export const BookingValidation = {
  createBookingSchema,
  payBookingSchema,
};
