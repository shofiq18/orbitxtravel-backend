import nodemailer from 'nodemailer';
import config from '../../config/index.js';

const wrapHtmlEmail = (contentHtml: string): string => {
  // Correct capitalization to OrbitX
  const sanitizedContent = contentHtml.replace(/orbitX/g, 'OrbitX');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrbitX Travel</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f6f9;
      color: #334155;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 580px;
      margin: 30px auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .email-header {
      background-color: #1e3b8b;
      padding: 24px;
      text-align: center;
    }
    .email-header-logo {
      color: #ffffff;
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-align: center;
    }
    .email-body {
      padding: 40px 32px;
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
    }
    .email-body h1 {
      font-size: 20px;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
      font-weight: 700;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 12px;
    }
    .email-body p {
      margin-top: 0;
      margin-bottom: 16px;
    }
    .email-body strong {
      color: #0f172a;
    }
    .email-body a {
      color: #1e3b8b;
      text-decoration: none;
      font-weight: 600;
    }
    .email-body a:hover {
      text-decoration: underline;
    }
    .email-footer {
      background-color: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
    }
    .email-footer p {
      margin: 0 0 6px 0;
    }
    .email-footer p:last-child {
      margin: 0;
    }
    /* Style OTP codes */
    .otp-code {
      font-size: 32px !important;
      letter-spacing: 8px !important;
      color: #047857 !important; /* Premium dark emerald green */
      background-color: #ecfdf5;
      padding: 16px 24px;
      display: block !important;
      box-sizing: border-box;
      border: 1px dashed #10b981;
      border-radius: 6px;
      margin: 20px 0 !important;
      font-family: 'Courier New', Courier, monospace;
      text-align: center;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <div class="email-header-logo">OrbitX Travel</div>
    </div>
    <div class="email-body">
      ${sanitizedContent}
    </div>
    <div class="email-footer">
      <p>This is an automated notification from OrbitX Travel.</p>
      <p>&copy; ${new Date().getFullYear()} OrbitX Travel. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    const sanitizedSubject = subject.replace(/orbitX/g, 'OrbitX');
    const wrappedHtml = wrapHtmlEmail(html);

    // Check if configuration parameters are default placeholder values
    const isMock =
      !config.email_user ||
      config.email_user === 'your_email@gmail.com' ||
      config.email_user === 'shofiq@gmail.com';

    if (isMock) {
      console.log(`\n📧 [EMAIL SIMULATION - OrbitX Travel]`);
      console.log(`To:      ${to}`);
      console.log(`Subject: ${sanitizedSubject}`);
      console.log(`Content:\n${wrappedHtml.replace(/<[^>]*>/g, ' ')}\n`);
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
      from: `"OrbitX Travel" <${config.email_user}>`,
      to,
      subject: sanitizedSubject,
      html: wrappedHtml,
    });
    console.log(`✉️ Email successfully sent to ${to}`);
  } catch (error) {
    console.warn('⚠️ SMTP Email delivery failed, falling back to simulated logs. Error:', error);
    const sanitizedSubject = subject.replace(/orbitX/g, 'OrbitX');
    const wrappedHtml = wrapHtmlEmail(html);
    console.log(`\n📧 [EMAIL SIMULATION FALLBACK]`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${sanitizedSubject}`);
    console.log(`Content:\n${wrappedHtml.replace(/<[^>]*>/g, ' ')}\n`);
  }
};
