import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  node_env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  database_url: process.env.DATABASE_URL,
  jwt_secret: process.env.JWT_SECRET || 'orbitx_travel_secret_jwt_key_2026_987654321',
  jwt_expires_in: process.env.JWT_EXPIRES_IN || '30d',
  email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  email_port: Number(process.env.EMAIL_PORT) || 587,
  email_user: process.env.EMAIL_USER,
  email_pass: process.env.EMAIL_PASS,
  cloudinary_name: process.env.CLOUDINARY_NAME,
  cloudinary_api_key: process.env.CLOUDINARY_API_KEY,
  cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET,
  sms_api_key: process.env.SMS_API_KEY,
  sms_sender_id: process.env.SMS_SENDER_ID || 'orbitX_SMS',
  platform_commission_rate: Number(process.env.PLATFORM_COMMISSION_RATE) || 0.10,
  otp_expiry_minutes: Number(process.env.OTP_EXPIRY_MINUTES) || 10,
};
