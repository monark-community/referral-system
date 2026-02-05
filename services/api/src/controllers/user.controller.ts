import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateEmailVerificationToken } from '../services/auth.service';
import { sendVerificationEmail } from '../services/email.service';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * GET /api/users/profile
 * Get current user's profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        walletAddress: true,
        name: true,
        email: true,
        phone: true,
        emailVerified: true,
        referralCode: true,
        earnedPoints: true,
        pendingPoints: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

/**
 * PUT /api/users/profile
 * Update user profile (name, email, phone)
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, email, phone } = req.body;

    // Check if email is already in use by another user
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          NOT: { id: req.user.id },
        },
      });

      if (existingUser) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    // Get current user to check if email changed
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const emailChanged = currentUser?.email?.toLowerCase() !== email?.toLowerCase();

    // Update profile
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        email: email?.toLowerCase(),
        phone: phone || null,
        // Reset email verification if email changed
        ...(emailChanged && {
          emailVerified: false,
          emailVerifyToken: null,
          emailVerifyExpiry: null,
        }),
      },
      select: {
        id: true,
        walletAddress: true,
        name: true,
        email: true,
        phone: true,
        emailVerified: true,
        referralCode: true,
        earnedPoints: true,
        pendingPoints: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      user: updatedUser,
      emailChanged,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * POST /api/users/verify-email/send
 * Send email verification link
 */
export async function sendVerificationEmail(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.email) {
      res.status(400).json({ error: 'Email not set. Please update your profile first.' });
      return;
    }

    if (user.emailVerified) {
      res.status(400).json({ error: 'Email already verified' });
      return;
    }

    // Generate verification token
    const token = generateEmailVerificationToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken: token,
        emailVerifyExpiry: expiry,
      },
    });

    // Send verification email
    const { sendVerificationEmail: sendEmail } = await import('../services/email.service');
    await sendEmail(user.email, token, user.name);

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('Send verification email error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
}

/**
 * GET /api/users/verify-email/:token
 * Verify email from link
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    // Find user with this token
    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      // Redirect to frontend with error
      res.redirect(`${FRONTEND_URL}/referrals/email-verified?error=invalid`);
      return;
    }

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    console.log(`Email verified for user: ${user.id} (${user.email})`);

    // Redirect to frontend success page
    res.redirect(`${FRONTEND_URL}/referrals/email-verified?success=true`);
  } catch (error) {
    console.error('Verify email error:', error);
    res.redirect(`${FRONTEND_URL}/referrals/email-verified?error=server`);
  }
}
