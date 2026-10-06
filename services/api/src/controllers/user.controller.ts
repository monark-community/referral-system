// Purpose: User controller - handles profile management, email verification, referral invite operations, and account status toggles
// Notes:
// - Coordinates DB writes with on-chain identifiers (bytes32 invite IDs) where needed
// - Verification endpoints redirect back to web flow after token validation

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

/**
 * GET /api/users/referral-rewards
 * Return the current user's direct and grandparent reward interactions.
 */
export async function getReferralRewardHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const walletAddress = req.user.walletAddress.toLowerCase();
    const allocations = await prisma.referralPointAllocation.findMany({
      where: {
        OR: [
          {
            directRecipientWalletAddress: walletAddress,
            directAmount: { gt: 0 },
          },
          {
            grandparentRecipientWalletAddress: walletAddress,
            grandparentAmount: { gt: 0 },
          },
        ],
      },
      orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    });

    const participantWallets = [
      ...new Set(
        allocations.map((allocation) =>
          allocation.participantWalletAddress.toLowerCase(),
        ),
      ),
    ];
    const participants = await prisma.user.findMany({
      where: { walletAddress: { in: participantWallets } },
      select: { walletAddress: true, name: true },
    });
    const participantByWallet = new Map(
      participants.map((participant) => [
        participant.walletAddress.toLowerCase(),
        participant,
      ]),
    );

    const rewardHistory = allocations.map((allocation) => {
      const isGrandparent =
        allocation.grandparentRecipientWalletAddress === walletAddress &&
        allocation.grandparentAmount > 0;
      const participantWalletAddress =
        allocation.participantWalletAddress.toLowerCase();
      const participant = participantByWallet.get(participantWalletAddress);

      return {
        id: allocation.id,
        transactionHash: allocation.transactionHash,
        blockNumber: allocation.blockNumber.toString(),
        logIndex: allocation.logIndex,
        participant: participant
          ? {
              walletAddress: participant.walletAddress,
              name: participant.name,
            }
          : { walletAddress: participantWalletAddress, name: null },
        referralLevel: isGrandparent ? 2 : 1,
        points: isGrandparent
          ? allocation.grandparentAmount
          : allocation.directAmount,
        pointPool: allocation.pool,
        unallocatedPoints: allocation.unallocatedAmount,
        source: allocation.source,
        observedAt: allocation.observedAt,
      };
    });

    res.json({ rewardHistory });
  } catch (error) {
    console.error("Get referral reward history error:", error);
    res.status(500).json({ error: "Failed to get referral reward history" });
  }
}

// Matches InviteStatus.Accepted in the contract; the listener sets it once a sign-up is on chain
const INVITE_ACCEPTED = 1;

const memberSelect = {
  id: true,
  walletAddress: true,
  name: true,
  createdAt: true,
} as const;

/**
 * GET /api/users/referral-network
 * Return who referred the current user (parent and grandparent), and the people they referred
 * two levels down with the points each one earned them.
 */
export async function getReferralNetwork(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const walletAddress = req.user.walletAddress.toLowerCase();

    // Only sign-ups confirmed on chain count, so the network matches the contract's
    const acceptedInvite = {
      status: INVITE_ACCEPTED,
      refereeId: { not: null },
    };

    const parentInvite = await prisma.referral.findFirst({
      where: { refereeId: req.user.id, status: INVITE_ACCEPTED },
      select: { referrer: { select: memberSelect } },
    });
    const parent = parentInvite?.referrer ?? null;
    const grandparentInvite = parent
      ? await prisma.referral.findFirst({
          where: { refereeId: parent.id, status: INVITE_ACCEPTED },
          select: { referrer: { select: memberSelect } },
        })
      : null;
    const grandparent = grandparentInvite?.referrer ?? null;

    const directInvites = await prisma.referral.findMany({
      where: { referrerId: req.user.id, ...acceptedInvite },
      select: { referee: { select: memberSelect } },
      orderBy: { referee: { createdAt: "asc" } },
    });
    const directReferrals = directInvites.flatMap((invite) =>
      invite.referee ? [invite.referee] : [],
    );
    const indirectInvites = directReferrals.length
      ? await prisma.referral.findMany({
          where: {
            referrerId: { in: directReferrals.map((referral) => referral.id) },
            ...acceptedInvite,
          },
          select: { referrerId: true, referee: { select: memberSelect } },
          orderBy: { referee: { createdAt: "asc" } },
        })
      : [];

    // What each person earned this user: the direct share for people they referred,
    // and the grandparent share for people their referrals referred
    const allocations = await prisma.referralPointAllocation.findMany({
      where: {
        OR: [
          { directRecipientWalletAddress: walletAddress },
          { grandparentRecipientWalletAddress: walletAddress },
        ],
      },
      select: {
        participantWalletAddress: true,
        directRecipientWalletAddress: true,
        directAmount: true,
        grandparentRecipientWalletAddress: true,
        grandparentAmount: true,
      },
    });
    const pointsFrom = new Map<string, number>();
    for (const allocation of allocations) {
      const points =
        allocation.directRecipientWalletAddress === walletAddress
          ? allocation.directAmount
          : allocation.grandparentAmount;
      const participant = allocation.participantWalletAddress.toLowerCase();
      pointsFrom.set(participant, (pointsFrom.get(participant) ?? 0) + points);
    }

    const summary = (user: { walletAddress: string; name: string | null } | null) =>
      user ? { walletAddress: user.walletAddress, name: user.name } : null;
    const member = (
      user: { walletAddress: string; name: string | null; createdAt: Date },
      level: 1 | 2,
    ) => ({
      walletAddress: user.walletAddress,
      name: user.name,
      level,
      joinedAt: user.createdAt,
      pointsEarned: pointsFrom.get(user.walletAddress.toLowerCase()) ?? 0,
    });

    const referrals = directReferrals.map((referral) => ({
      ...member(referral, 1),
      referrals: indirectInvites.flatMap((invite) =>
        invite.referrerId === referral.id && invite.referee
          ? [member(invite.referee, 2)]
          : [],
      ),
    }));
    const indirectReferrals = referrals.flatMap((referral) => referral.referrals);
    const sumPoints = (members: { pointsEarned: number }[]) =>
      members.reduce((total, current) => total + current.pointsEarned, 0);

    res.json({
      ancestors: { parent: summary(parent), grandparent: summary(grandparent) },
      referrals,
      totals: {
        level1Count: referrals.length,
        level2Count: indirectReferrals.length,
        level1Points: sumPoints(referrals),
        level2Points: sumPoints(indirectReferrals),
      },
    });
  } catch (error) {
    console.error("Get referral network error:", error);
    res.status(500).json({ error: "Failed to get referral network" });
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

    // Generate a unique referral code
    let inviteCode = generateInviteCode();
    let codeExists = true;

    // Ensure referral code is unique
    while (codeExists) {
      const existing = await prisma.referral.findUnique({
        where: { inviteCode },
      });
      if (!existing) {
        codeExists = false;
      } else {
        inviteCode = generateInviteCode();
      }
    }

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


/**
 * GET /api/users/referral-tree
 * Return the current user's grandparent, parent, children and grandchildren.
 */
export async function getReferralTree(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const node = { id: true, name: true, walletAddress: true } as const;
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        ...node,
        referrer: {
          select: { ...node, referrer: { select: node } },
        },
        referrals: {
          select: { ...node, referrals: { select: node } },
        },
      },
    });

    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { referrer, referrals, ...self } = me;
    res.json({
      me: self,
      parent: referrer ? { ...referrer, referrer: undefined } : null,
      grandparent: referrer?.referrer ?? null,
      children: referrals,
    });
  } catch (error) {
    console.error("Get referral tree error:", error);
    res.status(500).json({ error: "Failed to get referral tree" });
  }
}
