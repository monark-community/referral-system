const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * Send email verification link
 * In development: logs to console
 * In production: would use a real email service (SendGrid, Resend, etc.)
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  name?: string | null
): Promise<void> {
  // Link goes directly to backend, which redirects to frontend after verification
  const verificationUrl = `${API_URL}/api/users/verify-email/${token}`;

  // In development, log to console
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n========================================');
    console.log('📧 EMAIL VERIFICATION (Development Mode)');
    console.log('========================================');
    console.log(`To: ${email}`);
    console.log(`Name: ${name || 'User'}`);
    console.log(`Subject: Verify your email for Reffinity`);
    console.log('----------------------------------------');
    console.log('Email Content:');
    console.log(`\nHi ${name || 'there'},\n`);
    console.log('Welcome to Reffinity! Please verify your email by clicking the link below:\n');
    console.log(`🔗 ${verificationUrl}\n`);
    console.log('This link will expire in 24 hours.\n');
    console.log('If you did not create an account, please ignore this email.\n');
    console.log('Best,\nThe Reffinity Team');
    console.log('========================================\n');
    return;
  }

  // Production: integrate with real email service
  // Example with SendGrid, Resend, or Nodemailer
  // await sendgrid.send({
  //   to: email,
  //   from: 'noreply@reffinity.io',
  //   subject: 'Verify your email for Reffinity',
  //   html: `...`,
  // });

  throw new Error('Email service not configured for production');
}
