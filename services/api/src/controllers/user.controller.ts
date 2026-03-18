import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  generateEmailVerificationToken,
  generateInviteCode,
} from "../services/auth.service.js";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * GET /api/users/profile
 * Get current user's profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
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
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
}

/**
 * PUT /api/users/profile
 * Update user profile (name, email, phone)
 */
export async function updateProfile(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
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
        res.status(400).json({ error: "Email already in use" });
        return;
      }
    }

    // Get current user to check if email changed
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const emailChanged =
      currentUser?.email?.toLowerCase() !== email?.toLowerCase();

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
        milestoneLevel: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      user: updatedUser,
      emailChanged,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
}

/**
 * POST /api/users/verify-email/send
 * Send email verification link
 */
export async function sendVerificationEmail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!user.email) {
      res
        .status(400)
        .json({ error: "Email not set. Please update your profile first." });
      return;
    }

    if (user.emailVerified) {
      res.status(400).json({ error: "Email already verified" });
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
    const { sendVerificationEmail: sendEmail } =
      await import("../services/email.service.js");
    await sendEmail(user.email, token, user.name);

    res.json({ success: true, message: "Verification email sent" });
  } catch (error) {
    console.error("Send verification email error:", error);
    res.status(500).json({ error: "Failed to send verification email" });
  }
}

/**
 * GET /api/users/referral/:code
 * Validate a referral code and return the referrer's wallet address
 */
export async function validateReferralCode(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const code = req.params.code as string;

    if (!code) {
      res.status(400).json({ error: "Referral code is required" });
      return;
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code.toUpperCase() },
      select: { id: true, walletAddress: true },
    });

    if (!referrer) {
      res.status(404).json({ error: "Invalid referral code" });
      return;
    }

    res.json({ walletAddress: referrer.walletAddress });
  } catch (error) {
    console.error("Validate referral code error:", error);
    res.status(500).json({ error: "Failed to validate referral code" });
  }
}

/**
 * GET /api/users/verify-email/:token
 * Verify email from link
 */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token as string;

    if (!token) {
      res.status(400).json({ error: "Token is required" });
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
    console.error("Verify email error:", error);
    res.redirect(`${FRONTEND_URL}/referrals/email-verified?error=server`);
  }
}

/**
 * POST /api/users/accept-terms
 * Record that the user has accepted the terms of service
 */
export async function acceptTerms(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { termsAcceptedAt: new Date() },
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

    res.json({ user });
  } catch (error) {
    console.error("Accept terms error:", error);
    res.status(500).json({ error: "Failed to accept terms" });
  }
}

/**
 * POST /api/users/disable
 * Disable the current user's account
 */
export async function disableAccount(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { disabledAt: new Date() },
      select: { id: true, disabledAt: true },
    });

    res.json({ success: true, disabledAt: user.disabledAt });
  } catch (error) {
    console.error("Disable account error:", error);
    res.status(500).json({ error: "Failed to disable account" });
  }
}

/**
 * POST /api/users/enable
 * Re-enable the current user's account
 */
export async function enableAccount(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { disabledAt: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Enable account error:", error);
    res.status(500).json({ error: "Failed to enable account" });
  }
}

/**
 * GET /api/users/invites
 * Get current user's invites
 */
export async function getInvites(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const invites = await prisma.referral.findMany({
      where: {
        referrer: { walletAddress: req.user.walletAddress.toLowerCase() },
      },
      select: {
        id: true,
        referrer: true,
        referee: true,
        status: true,
        points: true,
        isVerified: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!invites) {
      res.status(404).json({ error: "No invites found" });
      return;
    }

    res.json({ invites });
  } catch (error) {
    console.error("Get invites error:", error);
    res.status(500).json({ error: "Failed to get invites" });
  }
}

export async function createPrivateInvite(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    var { description } = req.body;

    if (!description) {
      var numberOfReferrals = await prisma.referral.count({
        where: {
          referrer: { walletAddress: req.user.walletAddress.toLowerCase() },
        },
      });
      numberOfReferrals++;
      description = "Invite Number " + numberOfReferrals;
    }

    const inviteCode = generateInviteCode();

    const invite = await prisma.referral.create({
      data: {
        referrerId: req.user.id,
        status: 0,
        points: 0,
        isPrivate: true,
        description: description,
        inviteCode: inviteCode,
      },
    });
    const inviteId = invite.id;
    const bytesInviteId = inviteId ? uuidToBytes32(inviteId) : "";

    res.json({
      bytesinviteId: bytesInviteId,
      referralCode: req.user.referralCode,
      inviteCode: inviteCode,
      referrerWallet: req.user.walletAddress,
    });
  } catch (error) {
    console.error("Create Private Invite error:", error);
    res.status(500).json({ error: "Failed to create a private invites" });
  }
}
