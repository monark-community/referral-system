import nodemailer from 'nodemailer';

const API_URL = process.env.API_URL || 'http://localhost:3001';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string | null
): Promise<void> {
  const verificationUrl = `${API_URL}/api/users/verify-email/${token}`;

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Reffinity'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verify your email for Reffinity',
    html: `
      <p>Hi ${name || 'there'},</p>
      <p>Welcome to Reffinity! Please verify your email by clicking the link below:</p>
      <p><a href="${verificationUrl}">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
      <p>Best,<br>The Reffinity Team</p>
    `,
  });
}
