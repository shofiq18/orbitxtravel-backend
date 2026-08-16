import express from 'express';
import { UserController } from './user.controller.js';
import { UserValidation } from './user.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// Public auth routes
router.post('/signup', validateRequest(UserValidation.signupSchema), UserController.signup);
router.post('/verify-email', validateRequest(UserValidation.verifyEmailSchema), UserController.verifyEmail);
router.post('/resend-otp', validateRequest(UserValidation.resendOtpSchema), UserController.resendOtp);
router.post('/forgot-password', validateRequest(UserValidation.forgotPasswordSchema), UserController.forgotPassword);
router.post('/reset-password', validateRequest(UserValidation.resetPasswordSchema), UserController.resetPassword);
router.post('/login', validateRequest(UserValidation.loginSchema), UserController.login);

// Private authenticated routes
router.post(
  '/become-vendor',
  auth(),
  validateRequest(UserValidation.becomeVendorSchema),
  UserController.becomeVendor
);

router.post(
  '/switch-role',
  auth(),
  validateRequest(UserValidation.switchRoleSchema),
  UserController.switchRole
);

router.get('/profile', auth(), UserController.getProfile);
router.patch('/profile', auth(), UserController.updateProfile);

router.post(
  '/upload',
  auth(),
  UserController.uploadFile
);

router.post(
  '/change-password',
  auth(),
  validateRequest(UserValidation.changePasswordSchema),
  UserController.changePassword
);

export const UserRoutes = router;
