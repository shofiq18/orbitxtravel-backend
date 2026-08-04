import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../../config/index.js';
import catchAsync from '../utils/catchAsync.js';
import prisma from '../utils/prisma.js';
import AppError from '../utils/AppError.js';

const auth = (...roles: string[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let token = req.headers.authorization;

    // Support both Bearer token and Cookie-based session
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token && token.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }

    if (!token) {
      throw new AppError(401, 'You are not authorized! Token is missing.');
    }

    // Verify token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwt_secret) as JwtPayload;
    } catch (error) {
      throw new AppError(401, 'You are not authorized! Token is invalid or expired.');
    }

    const { id } = decoded;

    // Check if user exists in database
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError(401, 'User associated with this token no longer exists.');
    }

    // If roles are specified, verify user has permission under their current active role
    if (roles.length > 0) {
      // Check if user's active role is in the list of allowed roles.
      // Admins are allowed to access any route.
      const isAuthorized = roles.includes(user.currentRole) || user.roles.includes('admin');
      
      if (!isAuthorized) {
        throw new AppError(403, 'Forbidden: You do not have permission under your current active role.');
      }
      
      // If the role they are using is a vendor role (hotel_owner, tour_organizer), check if they are verified
      if ((user.currentRole === 'hotel_owner' || user.currentRole === 'tour_organizer') && !user.isVerified && !user.roles.includes('admin')) {
        throw new AppError(403, 'Forbidden: Your vendor registration is pending admin approval.');
      }
    }

    // Attach decoded user metadata to request object
    (req as any).user = {
      id: user.id,
      email: user.email,
      roles: user.roles,
      currentRole: user.currentRole,
    };

    next();
  });
};

export default auth;
