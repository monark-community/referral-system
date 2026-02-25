import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'console'; // 'resend', 'smtp', or 'console'
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@reffinity.io';
const FROM_NAME = process.env.FROM_NAME || 'Reffinity';

// Resend setup
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// SMTP setup
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for port 465, false for other ports
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let smtpTransporter: Transporter | null = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Generate email HTML template with Monark branding
 */
function getVerificationEmailHtml(
  name: string | null | undefined,
  verificationUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - Reffinity</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f0f0; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #121212; border-radius: 12px; overflow: hidden;">

          <!-- Header with text logo -->
          <tr>
            <td style="background-color: #121212; padding: 36px 40px 24px; text-align: center;">
              <span style="font-size: 24px; font-weight: 700; letter-spacing: 1px;">
                <span style="color: #F27A1A;">M</span><span style="color: #ffffff;">ONARK</span>
              </span>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background-color: #262626;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px 40px;">
              <p style="color: #ffffff; font-size: 22px; font-weight: 600; line-height: 28px; margin: 0 0 8px;">
                Verify your email
              </p>
              <p style="color: #a3a3a3; font-size: 15px; line-height: 22px; margin: 0 0 28px;">
                Hi ${name || 'there'}, confirm your email address to get started with the Reffinity referral program.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 4px 0 32px;">
                    <a href="${verificationUrl}" style="display: inline-block; background-color: #F27A1A; color: #ffffff; text-decoration: none; padding: 12px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1c1c1c; border-radius: 8px; border: 1px solid #262626;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="color: #737373; font-size: 12px; line-height: 16px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Or copy this link
                    </p>
                    <p style="color: #F27A1A; font-size: 13px; line-height: 18px; margin: 0; word-break: break-all;">
                      ${verificationUrl}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color: #525252; font-size: 13px; line-height: 18px; margin: 24px 0 0;">
                This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background-color: #262626;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 28px; text-align: center;">
              <p style="color: #525252; font-size: 12px; line-height: 16px; margin: 0;">
                Monark &middot; Reffinity Referral Program
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string | null
): Promise<void> {
  // Link goes directly to backend, which redirects to frontend after verification
  const verificationUrl = `${API_URL}/api/users/verify-email/${token}`;

  const emailHtml = getVerificationEmailHtml(name, verificationUrl);
  const subject = 'Verify your email for Reffinity';

  // Console mode (development/testing)
  if (EMAIL_PROVIDER === 'console' || (!resend && !smtpTransporter)) {
    console.log('\n========================================');
    console.log('📧 EMAIL VERIFICATION (Console Mode)');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`From: ${FROM_NAME} <${FROM_EMAIL}>`);
    console.log(`Name: ${name || 'User'}`);
    console.log(`Subject: ${subject}`);
    console.log('----------------------------------------');
    console.log(`🔗 Verification Link: ${verificationUrl}`);
    console.log('========================================\n');
    console.log('ℹ️  To send real emails, configure one of the following in .env:');
    console.log('   1. SMTP: Set SMTP_HOST, SMTP_USER, SMTP_PASS');
    console.log('   2. Resend: Set RESEND_API_KEY');
    console.log('   Then set EMAIL_PROVIDER=smtp or EMAIL_PROVIDER=resend\n');
    return;
  }

  try {
    // Send via SMTP
    if (EMAIL_PROVIDER === 'smtp' && smtpTransporter) {
      const info = await smtpTransporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: email,
        subject,
        html: emailHtml,
      });

      console.log(`✅ Verification email sent via SMTP to ${email} (ID: ${info.messageId})`);
      return;
    }

    // Send via Resend
    if (EMAIL_PROVIDER === 'resend' && resend) {
      const { data, error } = await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: email,
        subject,
        html: emailHtml,
      });

      if (error) {
        console.error('Resend error:', error);
        throw new Error(`Failed to send email: ${error.message}`);
      }

      console.log(`✅ Verification email sent via Resend to ${email} (ID: ${data?.id})`);
      return;
    }

    // If we get here, configuration is incomplete
    throw new Error(
      `Email provider "${EMAIL_PROVIDER}" is not properly configured. Check your .env file.`
    );
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw error;
  }
}
