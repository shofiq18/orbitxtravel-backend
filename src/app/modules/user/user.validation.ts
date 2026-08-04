import { z } from 'zod';

const signupSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters long'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string(),
  }),
});

const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
});

const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

const becomeVendorSchema = z.object({
  body: z.object({
    vendorType: z.enum(['hotel_owner', 'tour_organizer']),
    verificationDocUrl: z.string().url('Document URL must be a valid URL'),
    businessProfile: z.object({
      businessName: z.string().min(2, 'Business/Hotel/Agency Name is required'),
      address: z.string().min(5, 'Business address is required'),
      licenseNumber: z.string().optional(),
    }),
    payoutDetails: z.object({
      bankName: z.string().optional(),
      accountNumber: z.string().optional(),
      branch: z.string().optional(),
      bkashNumber: z.string().optional(),
      nagadNumber: z.string().optional(),
    }),
  }),
});

const switchRoleSchema = z.object({
  body: z.object({
    role: z.enum(['traveler', 'hotel_owner', 'tour_organizer', 'admin']),
  }),
});

export const UserValidation = {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  resendOtpSchema,
  becomeVendorSchema,
  switchRoleSchema,
};
