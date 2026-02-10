import { Request, Response } from 'express';
import pool from '../db/connection'; // Now exports PostgreSQL pool
import {
  generateJWT,
  verifyWalletSignature,
  generateReferralCode,
} from '../services/auth.service';

interface User {
  id: string;
  wallet_address: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  referral_code: string;
  earned_points: number;
  pending_points: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * POST /api/auth/wallet
 * Authenticate with wallet signature, create user if new
 */
export async function walletAuth(req: Request, res: Response): Promise<void> {
  const client = await pool.connect();

  try {
    const { walletAddress, signature, message } = req.body;

    // Verify the signature
    const isValid = verifyWalletSignature(message, signature, walletAddress);

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Normalize wallet address to lowercase
    const normalizedAddress = walletAddress.toLowerCase();

    // Check if user exists
    const userResult = await client.query<User>(
      'SELECT * FROM users WHERE wallet_address = $1',
      [normalizedAddress]
    );

    let user = userResult.rows[0];
    let isNewUser = false;

    // Create new user if not found
    if (!user) {
      isNewUser = true;

      // Generate a unique referral code
      let referralCode = generateReferralCode();
      let codeExists = true;

      // Ensure referral code is unique
      while (codeExists) {
        const existingResult = await client.query(
          'SELECT id FROM users WHERE referral_code = $1',
          [referralCode]
        );
        if (existingResult.rows.length === 0) {
          codeExists = false;
        } else {
          referralCode = generateReferralCode();
        }
      }

      const createResult = await client.query<User>(
        `INSERT INTO users (wallet_address, referral_code, terms_accepted_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [normalizedAddress, referralCode, new Date()]
      );

      user = createResult.rows[0];
      console.log(`New user created: ${user.id} (${normalizedAddress})`);
    }

    // Generate JWT token
    const token = generateJWT(user.id, user.wallet_address);

    // Return user data and token (convert snake_case to camelCase for API)
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
      token,
      isNewUser,
    });
  } catch (error) {
    console.error('Wallet auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  } finally {
    client.release();
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
export async function getMe(req: Request, res: Response): Promise<void> {
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
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/auth/logout
 * Logout (for session cleanup if needed)
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  // With JWT, logout is mainly handled client-side by removing the token
  // This endpoint can be used for future session invalidation features
  res.json({ success: true, message: 'Logged out successfully' });
}
