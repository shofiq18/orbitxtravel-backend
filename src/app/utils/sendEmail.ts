import nodemailer from 'nodemailer';
import config from '../../config/index.js';

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    // Check if configuration parameters are default placeholder values
    const isMock =
      !config.email_user ||
      config.email_user === 'your_email@gmail.com' ||
      config.email_user === 'shofiq@gmail.com';

    if (isMock) {
      console.log(`\n📧 [EMAIL SIMULATION - orbitX Travel]`);
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content:\n${html.replace(/<[^>]*>/g, ' ')}\n`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.email_host,
      port: config.email_port,
      secure: config.email_port === 465,
      auth: {
        user: config.email_user,
        pass: config.email_pass,
      },
    });

    await transporter.sendMail({
      from: `"orbitX Travel" <${config.email_user}>`,
      to,
      subject,
      html,
    });
    console.log(`✉️ Email successfully sent to ${to}`);
  } catch (error) {
    console.warn('⚠️ SMTP Email delivery failed, falling back to simulated logs. Error:', error);
    console.log(`\n📧 [EMAIL SIMULATION FALLBACK]`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content:\n${html.replace(/<[^>]*>/g, ' ')}\n`);
  }
};
