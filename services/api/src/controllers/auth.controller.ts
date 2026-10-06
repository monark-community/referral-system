// Purpose: Authentication controller - verifies wallet signatures, creates/logs in users, and serves auth session endpoints
// Notes:
// - New wallet users are provisioned with unique referral codes and optional referral/invite linkage
// - Returns JWT tokens used by auth middleware to protect private API routes

import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  generateJWT,
  verifyWalletSignature,
  generateReferralCode,
} from "../services/auth.service.js";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";

class PrivateInviteUnavailableError extends Error {}

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
      inviteCode: incomingInviteCode,
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

      const created = await prisma.$transaction(async (tx) => {
        let referrer: { id: string; walletAddress: string; referralCode: string } | null = null;
        let privateInviteId: string | undefined;

        if (incomingInviteCode) {
          const privateInvite = await tx.referral.findUnique({
            where: { inviteCode: incomingInviteCode },
            select: {
              id: true,
              refereeId: true,
              referrer: {
                select: { id: true, walletAddress: true, referralCode: true },
              },
            },
          });
          if (
            !privateInvite ||
            privateInvite.refereeId ||
            (incomingReferralCode &&
              privateInvite.referrer.referralCode !== incomingReferralCode.toUpperCase())
          ) {
            throw new PrivateInviteUnavailableError(
              "Private invite is invalid or has already been used",
            );
          }
          referrer = privateInvite.referrer;
          privateInviteId = privateInvite.id;
        } else if (incomingReferralCode) {
          referrer = await tx.user.findUnique({
            where: { referralCode: incomingReferralCode.toUpperCase() },
            select: { id: true, walletAddress: true, referralCode: true },
          });
        }

        const createdUser = await tx.user.create({
          data: {
            walletAddress: normalizedAddress,
            referralCode,
            referredBy: referrer?.id,
            termsAcceptedAt: null,
          },
        });

        let inviteId: string | undefined;
        if (privateInviteId) {
          const claimed = await tx.referral.updateMany({
            where: { id: privateInviteId, refereeId: null },
            data: { refereeId: createdUser.id, status: 0, points: 0 },
          });
          if (claimed.count !== 1) {
            throw new PrivateInviteUnavailableError(
              "Private invite is invalid or has already been used",
            );
          }
          inviteId = privateInviteId;
        } else if (referrer) {
          const invite = await tx.referral.create({
            data: {
              referrerId: referrer.id,
              refereeId: createdUser.id,
              status: 0,
              points: 0,
            },
          });
          inviteId = invite.id;
        }

        return { user: createdUser, referrer, inviteId };
      });

      user = created.user;
      referrerWalletAddress = created.referrer?.walletAddress;
      const inviteId = created.inviteId;

      bytesInviteId = inviteId ? uuidToBytes32(inviteId) : "";

      console.log(
        `New user created: ${user.id} (${normalizedAddress})${created.referrer ? ` referred by ${created.referrer.id}` : ""}`,
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
    if (error instanceof PrivateInviteUnavailableError) {
      res.status(409).json({ error: error.message });
      return;
    }
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
