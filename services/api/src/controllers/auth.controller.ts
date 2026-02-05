import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  generateJWT,
  verifyWalletSignature,
  generateReferralCode,
} from '../services/auth.service';

/**
 * POST /api/auth/wallet
 * Authenticate with wallet signature, create user if new
 */
export async function walletAuth(req: Request, res: Response): Promise<void> {
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
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    let isNewUser = false;

    // Create new user if not found
    if (!user) {
      isNewUser = true;

      // Generate a unique referral code
      let referralCode = generateReferralCode();
      let codeExists = true;

      // Ensure referral code is unique
      while (codeExists) {
        const existing = await prisma.user.findUnique({
          where: { referralCode },
        });
        if (!existing) {
          codeExists = false;
        } else {
          referralCode = generateReferralCode();
        }
      }

      user = await prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          referralCode,
          termsAcceptedAt: new Date(),
        },
      });

      console.log(`New user created: ${user.id} (${normalizedAddress})`);
    }

    // Generate JWT token
    const token = generateJWT(user.id, user.walletAddress);

    // Return user data and token
    res.json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        referralCode: user.referralCode,
        earnedPoints: user.earnedPoints,
        pendingPoints: user.pendingPoints,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
      isNewUser,
    });
  } catch (error) {
    console.error('Wallet auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
export async function getMe(req: Request, res: Response): Promise<void> {
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
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
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
