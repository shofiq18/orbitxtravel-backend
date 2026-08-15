import { z } from 'zod';

const createBookingSchema = z.object({
  body: z.object({
    // Tour Package Parameters
    packageId: z.string().uuid('Invalid Package ID').optional(),
    seatsBooked: z.number().int().positive('Seats booked must be at least 1').optional(),

    // Hotel Stay Parameters
    hotelId: z.string().uuid('Invalid Hotel ID').optional(),
    roomId: z.string().uuid('Invalid Room ID').optional(),
    roomQuantity: z.number().int().positive('Room quantity must be at least 1').optional(),
    checkInDate: z.string().optional(),
    checkOutDate: z.string().optional(),
  }).refine((data) => {
    if (data.packageId) {
      return !!data.seatsBooked;
    }
    return !!(data.hotelId && data.roomId && data.roomQuantity && data.checkInDate && data.checkOutDate);
  }, {
    message: 'Either packageId/seatsBooked or hotelId/roomId/roomQuantity/checkInDate/checkOutDate must be provided',
  }),
});

const payBookingSchema = z.object({
  body: z.object({
    paymentMethod: z.enum(['bkash', 'nagad', 'card', 'cod']),
    senderNumber: z.string().optional(),
    transactionId: z.string().optional(),
  }),
});

export const BookingValidation = {
  createBookingSchema,
  payBookingSchema,
};
