import { z } from 'zod';

const verifyVendorSchema = z.object({
  body: z.object({
    isVerified: z.boolean(),
  }),
});

const verifyPaymentSchema = z.object({
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().optional(),
  }),
});

const releasePayoutSchema = z.object({
  body: z.object({
    hostId: z.string().uuid('Invalid Host User ID'),
    amount: z.number().positive('Payout amount must be positive'),
    referenceId: z.string().optional(),
  }),
});

const suspendUserSchema = z.object({
  body: z.object({
    isSuspended: z.boolean(),
  }),
});

const updateCommissionRateSchema = z.object({
  body: z.object({
    ratePercentage: z.number().min(0, "Commission rate cannot be negative").max(100, "Commission rate cannot exceed 100%"),
  }),
});

export const AdminValidation = {
  verifyVendorSchema,
  verifyPaymentSchema,
  releasePayoutSchema,
  suspendUserSchema,
  updateCommissionRateSchema,
};
