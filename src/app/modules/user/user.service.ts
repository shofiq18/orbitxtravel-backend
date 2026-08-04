import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../../config/index.js';
import prisma from '../../utils/prisma.js';
import AppError from '../../utils/AppError.js';
import { sendEmail } from '../../utils/sendEmail.js';

// Helper to generate a 6-digit verification code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const signupUser = async (payload: any) => {
  const { email, password, fullName } = payload;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(400, 'User with this email already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + config.otp_expiry_minutes * 60 * 1000);

  const newUser = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName,
      roles: ['traveler'],
      currentRole: 'traveler',
      isEmailVerified: false,
      verificationOtp: otp,
      verificationOtpExpiry: otpExpiry,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      currentRole: true,
      isEmailVerified: true,
      createdAt: true,
    },
  });

  // Send verification email
  const emailBody = `
    <h1>Verify Your Email for orbitX Travel</h1>
    <p>Dear ${fullName},</p>
    <p>Thank you for signing up with orbitX Travel. Please use the following One-Time Password (OTP) to verify your registration:</p>
    <h2 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h2>
    <p>This code is valid for ${config.otp_expiry_minutes} minutes.</p>
  `;
  await sendEmail(email, 'Verify Your Email - orbitX Travel', emailBody);

  return newUser;
};

const verifyEmail = async (payload: { email: string; otp: string }) => {
  const { email, otp } = payload;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  if (user.isEmailVerified) {
    throw new AppError(400, 'Email is already verified.');
  }

  if (user.verificationOtp !== otp) {
    throw new AppError(400, 'Invalid verification code.');
  }

  if (!user.verificationOtpExpiry || new Date() > user.verificationOtpExpiry) {
    throw new AppError(400, 'Verification code has expired. Please request a new OTP.');
  }

  await prisma.user.update({
    where: { email },
    data: {
      isEmailVerified: true,
      verificationOtp: null,
      verificationOtpExpiry: null,
    },
  });

  return { message: 'Email verified successfully! You can now log in.' };
};

const resendOtp = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  if (user.isEmailVerified) {
    throw new AppError(400, 'Email is already verified.');
  }

  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + config.otp_expiry_minutes * 60 * 1000);

  await prisma.user.update({
    where: { email },
    data: {
      verificationOtp: otp,
      verificationOtpExpiry: otpExpiry,
    },
  });

  const emailBody = `
    <h1>Verify Your Email - orbitX Travel</h1>
    <p>Use the following OTP code to verify your email address:</p>
    <h2 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h2>
    <p>This code is valid for ${config.otp_expiry_minutes} minutes.</p>
  `;
  await sendEmail(email, 'Resend OTP - orbitX Travel', emailBody);

  return { message: 'OTP resent successfully to your email.' };
};

const loginUser = async (payload: any) => {
  const { email, password } = payload;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(401, 'Invalid email or password.');
  }

  if (!user.isEmailVerified) {
    throw new AppError(400, 'Please verify your email before logging in.');
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  if (!isPasswordMatched) {
    throw new AppError(401, 'Invalid email or password.');
  }

  // Create JWT Token
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      roles: user.roles,
      currentRole: user.currentRole,
    },
    config.jwt_secret,
    { expiresIn: config.jwt_expires_in as any }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      currentRole: user.currentRole,
      isVerified: user.isVerified,
    },
  };
};

const becomeVendor = async (userId: string, payload: any) => {
  const { vendorType, verificationDocUrl, businessProfile, payoutDetails } = payload;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  // Update user with vendor details and request approval
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      vendorType,
      verificationDocUrl,
      businessProfile,
      payoutDetails,
      isVerified: false, // Must be explicitly verified by Admin
    },
  });

  // Create notification
  await prisma.notification.create({
    data: {
      userId,
      title: 'Vendor Request Submitted',
      message: `Your request to become a ${vendorType === 'hotel_owner' ? 'Hotel Owner' : 'Tour Organizer'} has been submitted and is pending Admin approval.`,
    },
  });

  return {
    message: 'Vendor onboarding request submitted successfully. Waiting for admin approval.',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      vendorType: updatedUser.vendorType,
      isVerified: updatedUser.isVerified,
    },
  };
};

const switchRole = async (userId: string, targetRole: any) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  // Ensure user owns this role
  if (!user.roles.includes(targetRole)) {
    throw new AppError(400, `You do not possess the role of ${targetRole}.`);
  }

  // If role is vendor, verify the status
  if ((targetRole === 'hotel_owner' || targetRole === 'tour_organizer') && !user.isVerified) {
    throw new AppError(403, 'Your vendor status is not verified by admin yet.');
  }

  // Switch role
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { currentRole: targetRole },
  });

  // Re-generate JWT Token
  const token = jwt.sign(
    {
      id: updatedUser.id,
      email: updatedUser.email,
      roles: updatedUser.roles,
      currentRole: updatedUser.currentRole,
    },
    config.jwt_secret,
    { expiresIn: config.jwt_expires_in as any }
  );

  return {
    token,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      roles: updatedUser.roles,
      currentRole: updatedUser.currentRole,
      isVerified: updatedUser.isVerified,
    },
  };
};

const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      currentRole: true,
      isEmailVerified: true,
      isVerified: true,
      vendorType: true,
      businessProfile: true,
      payoutDetails: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found.');
  }

  return user;
};

const updateProfile = async (userId: string, payload: any) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      currentRole: true,
      isVerified: true,
      businessProfile: true,
      payoutDetails: true,
    },
  });

  return updatedUser;
};

export const UserService = {
  signupUser,
  verifyEmail,
  resendOtp,
  loginUser,
  becomeVendor,
  switchRole,
  getProfile,
  updateProfile,
};
