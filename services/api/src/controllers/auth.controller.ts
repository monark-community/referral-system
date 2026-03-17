import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  generateJWT,
  verifyWalletSignature,
  generateReferralCode,
} from "../services/auth.service.js";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";

/**
 * POST /api/auth/wallet
 * Authenticate with wallet signature, create user if new
 */
export async function walletAuth(req: Request, res: Response): Promise<void> {
  try {
    const {
      walletAddress,
      signature,
      message,
      referralCode: incomingReferralCode,
    } = req.body;

    // Verify the signature
    const isValid = verifyWalletSignature(message, signature, walletAddress);

    if (!isValid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // Normalize wallet address to lowercase
    const normalizedAddress = walletAddress.toLowerCase();

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    let isNewUser = false;
    let referrerWalletAddress: string | undefined;
    let bytesInviteId: string | undefined;

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

      // Look up referrer if a referral code was provided
      let referredBy: string | undefined;
      if (incomingReferralCode) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: incomingReferralCode.toUpperCase() },
          select: { id: true, walletAddress: true },
        });
        if (referrer) {
          referredBy = referrer.id;
          referrerWalletAddress = referrer.walletAddress;
        }
      }

      user = await prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          referralCode,
          referredBy,
          termsAcceptedAt: null,
        },
      });

      var inviteId: string | undefined;

      // Create a Referral record to track this individual referral
      if (referredBy) {
        let invite = await prisma.referral.create({
          data: {
            referrerId: referredBy,
            refereeId: user.id,
            status: 0,
            points: 0,
          },
        });
        inviteId = invite.id;
      }

      bytesInviteId = inviteId ? uuidToBytes32(inviteId) : "";

      console.log(
        `New user created: ${user.id} (${normalizedAddress})${referredBy ? ` referred by ${referredBy}` : ""}`,
      );
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
        milestoneLevel: user.milestoneLevel,
        disabledAt: user.disabledAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
      isNewUser,
      bytesInviteId,
      ...(referrerWalletAddress && { referrerWalletAddress }),
    });
  } catch (error) {
    console.error("Wallet auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
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
        milestoneLevel: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
}

/**
 * POST /api/auth/logout
 * Logout (for session cleanup if needed)
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  // With JWT, logout is mainly handled client-side by removing the token
  // This endpoint can be used for future session invalidation features
  res.json({ success: true, message: "Logged out successfully" });
}
