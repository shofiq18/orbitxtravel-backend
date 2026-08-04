import { z } from 'zod';

const verifyVendorSchema = z.object({
  body: z.object({
    isVerified: z.boolean(),
  }),
});

const releasePayoutSchema = z.object({
  body: z.object({
    hostId: z.string().uuid('Invalid Host User ID'),
    amount: z.number().positive('Payout amount must be positive'),
    referenceId: z.string().optional(),
  }),
});

export const AdminValidation = {
  verifyVendorSchema,
  releasePayoutSchema,
};
