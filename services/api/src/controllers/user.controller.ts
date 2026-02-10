import { Request, Response } from 'express';
import pool from '../db/connection'; // Now exports PostgreSQL pool
import { generateEmailVerificationToken } from '../services/auth.service';


const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface User {
  id: string;
  wallet_address: string;
  name: string | null;
  email: string | null;
  phone: string | null;  
  email_verified: boolean;
  email_verify_token: string | null;
  email_verify_expiry: Date | null;
  referral_code: string;
  earned_points: number;
  pending_points: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * GET /api/users/profile
 * Get current user's profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userResult = await client.query<User>(
      `SELECT id, wallet_address, name, email, phone, email_verified,
              referral_code, earned_points, pending_points, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Convert snake_case to camelCase
    res.json({
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.email_verified,
        referralCode: user.referral_code,
        earnedPoints: user.earned_points,
        pendingPoints: user.pending_points,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  } finally {
    client.release();
  }
}

/**
 * PUT /api/users/profile
 * Update user profile (name, email, phone)
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, email, phone } = req.body;

    // Check if email is already in use by another user
    if (email) {
      const existingResult = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
        [email, req.user.id]
      );

      if (existingResult.rows.length > 0) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    // Get current user to check if email changed
    const currentUserResult = await client.query<User>(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const currentUser = currentUserResult.rows[0];

    const emailChanged = currentUser?.email?.toLowerCase() !== email?.toLowerCase();

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      updateValues.push(email?.toLowerCase());
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      updateValues.push(phone || null);
    }

    // Reset email verification if email changed
    if (emailChanged) {
      updateFields.push(`email_verified = $${paramIndex++}`);
      updateValues.push(false);
      updateFields.push(`email_verify_token = $${paramIndex++}`);
      updateValues.push(null);
      updateFields.push(`email_verify_expiry = $${paramIndex++}`);
      updateValues.push(null);
    }

    // Add user ID as last parameter
    updateValues.push(req.user.id);

    // Update profile
    const updatedUserResult = await client.query<User>(
      `UPDATE users
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, wallet_address, name, email, phone, email_verified,
                 referral_code, earned_points, pending_points, created_at, updated_at`,
      updateValues
    );

    const updatedUser = updatedUserResult.rows[0];

    // Convert snake_case to camelCase
    res.json({
      user: {
        id: updatedUser.id,
        walletAddress: updatedUser.wallet_address,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        emailVerified: updatedUser.email_verified,
        referralCode: updatedUser.referral_code,
        earnedPoints: updatedUser.earned_points,
        pendingPoints: updatedUser.pending_points,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
      },
      emailChanged,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/users/verify-email/send
 * Send email verification link
 */
export async function sendVerificationEmail(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userResult = await client.query<User>(
      'SELECT id, email, email_verified, name FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.email) {
      res.status(400).json({ error: 'Email not set. Please update your profile first.' });
      return;
    }

    if (user.email_verified) {
      res.status(400).json({ error: 'Email already verified' });
      return;
    }

    // Generate verification token
    const token = generateEmailVerificationToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with verification token
    await client.query(
      `UPDATE users
       SET email_verify_token = $1, email_verify_expiry = $2
       WHERE id = $3`,
      [token, expiry, user.id]
    );

    // Send verification email
    const { sendVerificationEmail: sendEmail } = await import('../services/email.service');
    await sendEmail(user.email, token, user.name);

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('Send verification email error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/users/verify-email/:token
 * Verify email from link
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    // Find user with this token that hasn't expired
    const userResult = await client.query<User>(
      `SELECT id, email FROM users
       WHERE email_verify_token = $1 AND email_verify_expiry > NOW()`,
      [token]
    );

    const user = userResult.rows[0];

    if (!user) {
      // Redirect to frontend with error
      res.redirect(`${FRONTEND_URL}/referrals/email-verified?error=invalid`);
      return;
    }

    // Update user - set verified and clear token
    await client.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verify_token = NULL,
           email_verify_expiry = NULL
       WHERE id = $1`,
      [user.id]
    );

    console.log(`Email verified for user: ${user.id} (${user.email})`);

    // Redirect to frontend success page
    res.redirect(`${FRONTEND_URL}/referrals/email-verified?success=true`);
  } catch (error) {
    console.error('Verify email error:', error);
    res.redirect(`${FRONTEND_URL}/referrals/email-verified?error=server`);
  } finally {
    client.release();
  }
}
