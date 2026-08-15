import { sendEmail } from './sendEmail.js';

export const sendSMS = async (to: string, message: string) => {
  // Free Email Service Migration: Route legacy SMS calls to sendEmail to avoid SMS carrier costs
  const emailSubject = 'OrbitX Travel Notification';
  const emailHtml = `
    <h1>OrbitX Travel Notification</h1>
    <p>${message}</p>
  `;
  await sendEmail(to, emailSubject, emailHtml);
};
