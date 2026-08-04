import { Request, Response } from 'express';
import { UserService } from './user.service.js';
import catchAsync from '../../utils/catchAsync.js';
import sendResponse from '../../utils/sendResponse.js';

const signup = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.signupUser(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'User registered successfully. Check your email for OTP verification.',
    data: result,
  });
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.verifyEmail(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.resendOtp(req.body.email);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.loginUser(req.body);

  // Secure cookie configuration
  res.cookie('token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully.',
    data: result,
  });
});

const becomeVendor = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await UserService.becomeVendor(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result.user,
  });
});

const switchRole = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { role } = req.body;
  const result = await UserService.switchRole(userId, role);

  // Update session cookie with new token
  res.cookie('token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Switched active role to ${role} successfully.`,
    data: result,
  });
});

const getProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await UserService.getProfile(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User profile retrieved successfully.',
    data: result,
  });
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const result = await UserService.updateProfile(userId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile updated successfully.',
    data: result,
  });
});

export const UserController = {
  signup,
  verifyEmail,
  resendOtp,
  login,
  becomeVendor,
  switchRole,
  getProfile,
  updateProfile,
};
