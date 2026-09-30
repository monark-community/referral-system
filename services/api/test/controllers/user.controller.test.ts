// Purpose: Unit tests for user controller endpoints (profile, verification, referrals, and account status changes)
// Notes:
// - Uses mocked Prisma + connector helpers to validate response behavior without live dependencies

import {
  getProfile,
  updateProfile,
  sendVerificationEmail,
  validateReferralCode,
  verifyEmail,
  disableAccount,
  enableAccount,
  getInvites,
  getReferralRewardHistory,
  getReferralNetwork,
  createPrivateInvite,
  acceptTerms,
} from "@/controllers/user.controller.js";
import { prisma } from "@/lib/prisma.js";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { verify } from "crypto";
import { id } from "ethers";
import { body } from "express-validator";
import { get } from "http";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    referral: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    referralPointAllocation: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({
    uuidToBytes32: jest.fn(),
  }),
  { virtual: true },
);

var res: any;
var req: any;

describe("User Controller test", () => {
  beforeEach(() => {
    // Mock request and response objects
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
    };
  });

  test("getProfile should fail on not authenticated user", async () => {
    req = {};

    await getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("getProfile should return user profile", async () => {
    req = { user: { id: "user1" } };

    const mockUser = {
      id: "user1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      name: "Test User",
      email: "",
      phone: "",
      emailVerified: false,
      referralCode: "REFERRAL123",
      earnedPoints: 0,
      pendingPoints: 0,
      milestoneLevel: 0,
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (prisma.user.findUnique as jest.Mock).mockReturnValue(mockUser);

    await getProfile(req, res);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user1" },
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

    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: "user1",
        walletAddress: "0x1234567890123456789012345678901234567890",
        name: "Test User",
        email: "",
        phone: "",
        emailVerified: false,
        referralCode: "REFERRAL123",
        earnedPoints: 0,
        pendingPoints: 0,
        milestoneLevel: 0,
        disabledAt: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
  });

  test("getProfile should fail on no user found", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue(null);

    await getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "User not found",
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updateProfile should fail on not authenticated user", async () => {
    req = {};

    await updateProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("updateProfile should update user profile if the user is authenticated", async () => {
    req = {
      user: { id: "user1" },
      body: {
        name: "Updated Name",
        email: "updated@example.com",
        phone: "1234567890",
      },
    };

    (prisma.user.findFirst as jest.Mock).mockReturnValue(null);

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      id: "user1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      name: "Updated Name",
      email: "first@example.com",
      phone: "1234567890",
      emailVerified: false,
      referralCode: "REFERRAL123",
      earnedPoints: 0,
      pendingPoints: 0,
      milestoneLevel: 0,
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateProfile(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: {
        name: "Updated Name",
        email: "updated@example.com",
        phone: "1234567890",
        emailVerified: false,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
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
  });

  test("updateProfile should fail if email is already in use", async () => {
    req = {
      user: { id: "user1" },
      body: {
        name: "Updated Name",
        email: "updated@example.com",
        phone: "1234567890",
      },
    };

    (prisma.user.findFirst as jest.Mock).mockReturnValue({
      id: "user1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      name: "Updated Name",
      email: "updated@example.com",
      phone: "1234567890",
      emailVerified: false,
      referralCode: "REFERRAL123",
      earnedPoints: 0,
      pendingPoints: 0,
      milestoneLevel: 0,
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Email already in use",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("sendVerificationEmail should fail on not authenticated user", async () => {
    req = {};

    await sendVerificationEmail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("sendVerificationEmail should fail on no user found", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue(null);

    await sendVerificationEmail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "User not found",
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("sendVerificationEmail should fail on no user email address", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({ email: null });

    await sendVerificationEmail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Email not set. Please update your profile first.",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("sendVerificationEmail should fail on email already verified", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      email: "test@example.com",
      emailVerified: true,
    });

    await sendVerificationEmail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Email already verified",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("sendVerificationEmail should send email on corect input", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      id: "user1",
      email: "test@example.com",
      emailVerified: false,
    });

    await sendVerificationEmail(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: {
        emailVerifyToken: expect.any(String),
        emailVerifyExpiry: expect.any(Date),
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      message: "Verification email sent",
      success: true,
    });
  });

  test("validateRefferalCode should fail on invalid code", async () => {
    req = { params: { code: "INVALIDCODE" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue(null);

    await validateReferralCode(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid referral code",
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("validateRefferalCode should fail when no code is given", async () => {
    req = { params: {} };

    await validateReferralCode(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Referral code is required",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("validateRefferalCode should return wallet address on success", async () => {
    req = { params: { code: "VALIDCODE" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      walletAddress: "0x1234567890123456789012345678901234567890",
    });

    await validateReferralCode(req, res);

    expect(res.json).toHaveBeenCalledWith({
      walletAddress: "0x1234567890123456789012345678901234567890",
    });
  });

  test("verifyEmail should fail on no token", async () => {
    req = { params: {} };

    await verifyEmail(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Token is required",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("verifyEmail should redirect on no valid  email token", async () => {
    req = { params: { token: "123456" } };

    (prisma.user.findFirst as jest.Mock).mockReturnValue(null);

    await verifyEmail(req, res);

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/referrals/email-verified?error=invalid`),
    );
  });

  test("verifyEmail should set to alid on a valid token", async () => {
    req = { params: { token: "123456" } };

    (prisma.user.findFirst as jest.Mock).mockReturnValue({ id: "user1" });

    await verifyEmail(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining(`/referrals/email-verified?success=true`),
    );
  });

  test("disableAccount should fail on not authenticated user", async () => {
    req = {};

    await disableAccount(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("disableAccount should disable user", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.update as jest.Mock).mockReturnValue({
      id: "user1",
      disabledAt: new Date(),
    });

    await disableAccount(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { disabledAt: expect.any(Date) },
      select: { id: true, disabledAt: true },
    });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      disabledAt: expect.any(Date),
    });
  });

  test("enableAccount should fail on not authenticated user", async () => {
    req = {};

    await enableAccount(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("enableAccount should enable user", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.update as jest.Mock).mockReturnValue({
      id: "user1",
      disabledAt: null,
    });

    await enableAccount(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { disabledAt: expect.any(Date) },
      select: { id: true, disabledAt: true },
    });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
    });
  });

  test("getInvites should fail on not authenticated user", async () => {
    req = {};

    await getInvites(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("getInvites should 404 on no invites", async () => {
    req = { user: { id: "user1", walletAddress: "abcd-1234-defg-5678" } };

    (prisma.referral.findMany as jest.Mock).mockReturnValue(null);

    await getInvites(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "No invites found",
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("getInvites should return the user's invites", async () => {
    req = { user: { id: "user1", walletAddress: "abcd-1234-defg-5678" } };

    (prisma.referral.findMany as jest.Mock).mockReturnValue([
      {
        id: "user1",
      },
    ]);

    await getInvites(req, res);

    expect(prisma.referral.findMany).toHaveBeenCalledWith({
      where: {
        referrer: { walletAddress: req.user.walletAddress.toLowerCase() },
      },
      select: {
        id: true,
        referrer: true,
        referee: true,
        status: true,
        points: true,
        description: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      invites: [
        {
          id: "user1",
        },
      ],
    });
  });

  test("getReferralRewardHistory should fail on an unauthenticated user", async () => {
    req = {};

    await getReferralRewardHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
  });

  test("getReferralRewardHistory should expose direct and grandchild interactions", async () => {
    req = { user: { id: "user1", walletAddress: "0xGRANDPARENT" } };
    const observedAt = new Date("2026-09-29T12:00:00.000Z");
    (prisma.referralPointAllocation.findMany as jest.Mock).mockResolvedValue([
      {
        id: "allocation-grandchild",
        transactionHash: "0xtwo",
        blockNumber: 22n,
        logIndex: 3,
        participantWalletAddress: "0xgrandchild",
        pool: 100,
        directRecipientWalletAddress: "0xparent",
        directAmount: 80,
        grandparentRecipientWalletAddress: "0xgrandparent",
        grandparentAmount: 20,
        unallocatedAmount: 0,
        source: "signup",
        observedAt,
      },
      {
        id: "allocation-child",
        transactionHash: "0xone",
        blockNumber: 21n,
        logIndex: 1,
        participantWalletAddress: "0xchild",
        pool: 100,
        directRecipientWalletAddress: "0xgrandparent",
        directAmount: 80,
        grandparentRecipientWalletAddress: "0xzero",
        grandparentAmount: 0,
        unallocatedAmount: 20,
        source: "signup",
        observedAt,
      },
    ]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { walletAddress: "0xgrandchild", name: "Grandchild" },
    ]);

    await getReferralRewardHistory(req, res);

    expect(prisma.referralPointAllocation.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            directRecipientWalletAddress: "0xgrandparent",
            directAmount: { gt: 0 },
          },
          {
            grandparentRecipientWalletAddress: "0xgrandparent",
            grandparentAmount: { gt: 0 },
          },
        ],
      },
      orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    });
    expect(res.json).toHaveBeenCalledWith({
      rewardHistory: [
        expect.objectContaining({
          id: "allocation-grandchild",
          blockNumber: "22",
          participant: {
            walletAddress: "0xgrandchild",
            name: "Grandchild",
          },
          referralLevel: 2,
          points: 20,
          source: "signup",
        }),
        expect.objectContaining({
          id: "allocation-child",
          blockNumber: "21",
          participant: { walletAddress: "0xchild", name: null },
          referralLevel: 1,
          points: 80,
          source: "signup",
        }),
      ],
    });
  });

  describe("getReferralNetwork", () => {
    const joinedAt = new Date("2026-09-20T12:00:00.000Z");
    const person = (id: string, name: string | null = null) => ({
      id,
      walletAddress: `0x${id}`,
      name,
      createdAt: joinedAt,
    });

    // A payout as the listener stores it
    const payout = (participant: string, direct: string, grandparent: string) => ({
      participantWalletAddress: `0x${participant}`,
      directRecipientWalletAddress: `0x${direct}`,
      directAmount: 80,
      grandparentRecipientWalletAddress: `0x${grandparent}`,
      grandparentAmount: 20,
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("fails on an unauthenticated user", async () => {
      req = {};

      await getReferralNetwork(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    });

    test("returns who referred the user and two levels of referrals, with the points each earned them", async () => {
      req = { user: { id: "me", walletAddress: "0xME" } };
      (prisma.referral.findFirst as jest.Mock)
        .mockResolvedValueOnce({ referrer: person("parent", "Parent") })
        .mockResolvedValueOnce({ referrer: person("grandparent", "Grandparent") });
      (prisma.referral.findMany as jest.Mock)
        .mockResolvedValueOnce([{ referee: person("alice", "Alice") }, { referee: person("bob", "Bob") }])
        .mockResolvedValueOnce([{ referrerId: "alice", referee: person("carol") }]);
      (prisma.referralPointAllocation.findMany as jest.Mock).mockResolvedValueOnce([
        payout("alice", "me", "parent"), // I get the direct 80
        payout("bob", "me", "parent"),
        payout("carol", "alice", "me"), // I get the grandparent 20
      ]);

      await getReferralNetwork(req, res);

      // Walks up the chain through accepted invites
      expect(prisma.referral.findFirst).toHaveBeenNthCalledWith(1, {
        where: { refereeId: "me", status: 1 },
        select: { referrer: { select: expect.any(Object) } },
      });
      expect(prisma.referral.findFirst).toHaveBeenNthCalledWith(2, {
        where: { refereeId: "parent", status: 1 },
        select: { referrer: { select: expect.any(Object) } },
      });
      // Only sign-ups the chain confirmed count
      expect(prisma.referral.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: { referrerId: "me", status: 1, refereeId: { not: null } },
      }));
      expect(prisma.referral.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: { referrerId: { in: ["alice", "bob"] }, status: 1, refereeId: { not: null } },
      }));
      expect(prisma.referralPointAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          OR: [
            { directRecipientWalletAddress: "0xme" },
            { grandparentRecipientWalletAddress: "0xme" },
          ],
        },
      }));
      expect(res.json).toHaveBeenCalledWith({
        ancestors: {
          parent: { walletAddress: "0xparent", name: "Parent" },
          grandparent: { walletAddress: "0xgrandparent", name: "Grandparent" },
        },
        referrals: [
          {
            walletAddress: "0xalice",
            name: "Alice",
            level: 1,
            joinedAt,
            pointsEarned: 80,
            referrals: [
              { walletAddress: "0xcarol", name: null, level: 2, joinedAt, pointsEarned: 20 },
            ],
          },
          { walletAddress: "0xbob", name: "Bob", level: 1, joinedAt, pointsEarned: 80, referrals: [] },
        ],
        totals: { level1Count: 2, level2Count: 1, level1Points: 160, level2Points: 20 },
      });
    });

    test("returns an empty network for a user who joined without an invite and referred nobody", async () => {
      req = { user: { id: "me", walletAddress: "0xME" } };
      (prisma.referral.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.referral.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.referralPointAllocation.findMany as jest.Mock).mockResolvedValueOnce([]);

      await getReferralNetwork(req, res);

      // No parent means no grandparent lookup, and no level 1 means no level 2 lookup
      expect(prisma.referral.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.referral.findMany).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({
        ancestors: { parent: null, grandparent: null },
        referrals: [],
        totals: { level1Count: 0, level2Count: 0, level1Points: 0, level2Points: 0 },
      });
    });

    test("shows a referral who has not earned the user anything yet with 0 points", async () => {
      req = { user: { id: "me", walletAddress: "0xME" } };
      (prisma.referral.findFirst as jest.Mock)
        .mockResolvedValueOnce({ referrer: person("parent", "Parent") })
        .mockResolvedValueOnce(null); // the parent joined without an invite
      (prisma.referral.findMany as jest.Mock)
        .mockResolvedValueOnce([{ referee: person("alice", "Alice") }])
        .mockResolvedValueOnce([]);
      (prisma.referralPointAllocation.findMany as jest.Mock).mockResolvedValueOnce([]);

      await getReferralNetwork(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        ancestors: {
          parent: { walletAddress: "0xparent", name: "Parent" },
          grandparent: null,
        },
        referrals: [expect.objectContaining({ walletAddress: "0xalice", pointsEarned: 0, referrals: [] })],
      }));
    });
  });

  test("createPrivateInvite should fail on non authenticated user", async () => {
    req = {};

    await createPrivateInvite(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("createPrivateInvite should create new Invite with pending status", async () => {
    req = {
      user: {
        id: "user1",
        referralCode: "ABCDEFGHIJ",
        walletAddress: "0x9876543210",
      },
      body: {
        description: null,
      },
    };

    (prisma.referral.count as jest.Mock).mockReturnValue(0);
    (uuidToBytes32 as jest.Mock).mockReturnValue("0x012345678");
    (prisma.referral.create as jest.Mock).mockReturnValue({
      id: "user2",
    });

    await createPrivateInvite(req, res);

    expect(prisma.referral.create).toHaveBeenCalledWith({
      data: {
        referrerId: req.user.id,
        status: 0,
        points: 0,
        isPrivate: true,
        description: "Invite Number 1",
        inviteCode: expect.any(String),
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      bytesinviteId: "0x012345678",
      referralCode: req.user.referralCode,
      inviteCode: expect.any(String),
      referrerWallet: "0x9876543210",
    });
  });

  test("createPrivateInvite should create new Invite with pending status with custom description", async () => {
    req = {
      user: {
        id: "user1",
        referralCode: "ABCDEFGHIJ",
        walletAddress: "0x9876543210",
      },
      body: {
        description: "my description",
      },
    };

    (prisma.referral.count as jest.Mock).mockReturnValue(0);
    (uuidToBytes32 as jest.Mock).mockReturnValue("0x012345678");
    (prisma.referral.create as jest.Mock).mockReturnValue({
      id: "user2",
    });

    await createPrivateInvite(req, res);

    expect(prisma.referral.create).toHaveBeenCalledWith({
      data: {
        referrerId: req.user.id,
        status: 0,
        points: 0,
        isPrivate: true,
        description: "my description",
        inviteCode: expect.any(String),
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      bytesinviteId: "0x012345678",
      referralCode: req.user.referralCode,
      inviteCode: expect.any(String),
      referrerWallet: "0x9876543210",
    });
  });

  describe("acceptTerms, database errors and invite code collisions", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("acceptTerms should fail on not authenticated user", async () => {
      req = {};

      await acceptTerms(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    });

    test("acceptTerms should record when the user accepted the terms", async () => {
      req = { user: { id: "user1" } };
      const updatedUser = { id: "user1", walletAddress: "0xabc" };
      (prisma.user.update as jest.Mock).mockResolvedValueOnce(updatedUser);

      await acceptTerms(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user1" },
          data: { termsAcceptedAt: expect.any(Date) },
        }),
      );
      expect(res.json).toHaveBeenCalledWith({ user: updatedUser });
    });

    test("createPrivateInvite should generate a new invite code when the first one is taken", async () => {
      req = {
        user: { id: "user1", referralCode: "ABCDEFGHIJ", walletAddress: "0x9876543210" },
        body: { description: "my description" },
      };
      (prisma.referral.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: "existing-invite" }) // first code is taken
        .mockResolvedValueOnce(null); // second code is free
      (prisma.referral.create as jest.Mock).mockResolvedValueOnce({ id: "invite2" });

      await createPrivateInvite(req, res);

      const triedCodes = (prisma.referral.findUnique as jest.Mock).mock.calls.map(
        ([args]) => args.where.inviteCode,
      );
      expect(triedCodes).toHaveLength(2);
      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ inviteCode: triedCodes[1] }),
      });
    });

    test("verifyEmail should send the user to the error page when the database fails", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      req = { params: { token: "123456" } };
      (prisma.user.findFirst as jest.Mock).mockRejectedValueOnce(new Error("db down"));

      await verifyEmail(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(`/referrals/email-verified?error=server`),
      );
      consoleError.mockRestore();
    });

    // Every endpoint catches database errors and answers with a 500
    test.each([
      {
        name: "getProfile",
        handler: getProfile,
        failing: prisma.user.findUnique,
        request: { user: { id: "user1" } },
        error: "Failed to get profile",
      },
      {
        name: "updateProfile",
        handler: updateProfile,
        failing: prisma.user.findFirst,
        request: { user: { id: "user1" }, body: { email: "new@example.com" } },
        error: "Failed to update profile",
      },
      {
        name: "sendVerificationEmail",
        handler: sendVerificationEmail,
        failing: prisma.user.findUnique,
        request: { user: { id: "user1" } },
        error: "Failed to send verification email",
      },
      {
        name: "validateReferralCode",
        handler: validateReferralCode,
        failing: prisma.user.findUnique,
        request: { params: { code: "ABC123" } },
        error: "Failed to validate referral code",
      },
      {
        name: "acceptTerms",
        handler: acceptTerms,
        failing: prisma.user.update,
        request: { user: { id: "user1" } },
        error: "Failed to accept terms",
      },
      {
        name: "disableAccount",
        handler: disableAccount,
        failing: prisma.user.update,
        request: { user: { id: "user1" } },
        error: "Failed to disable account",
      },
      {
        name: "enableAccount",
        handler: enableAccount,
        failing: prisma.user.update,
        request: { user: { id: "user1" } },
        error: "Failed to enable account",
      },
      {
        name: "getInvites",
        handler: getInvites,
        failing: prisma.referral.findMany,
        request: { user: { id: "user1", walletAddress: "0xABC" } },
        error: "Failed to get invites",
      },
      {
        name: "getReferralRewardHistory",
        handler: getReferralRewardHistory,
        failing: prisma.referralPointAllocation.findMany,
        request: { user: { id: "user1", walletAddress: "0xABC" } },
        error: "Failed to get referral reward history",
      },
      {
        name: "getReferralNetwork",
        handler: getReferralNetwork,
        failing: prisma.referral.findFirst,
        request: { user: { id: "user1", walletAddress: "0xABC" } },
        error: "Failed to get referral network",
      },
      {
        name: "createPrivateInvite",
        handler: createPrivateInvite,
        failing: prisma.referral.count,
        request: { user: { id: "user1", walletAddress: "0xABC" }, body: {} },
        error: "Failed to create a private invites",
      },
    ])("$name returns 500 when the database fails", async ({ handler, failing, request, error }) => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      (failing as jest.Mock).mockRejectedValueOnce(new Error("db down"));

      await handler(request as any, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error });
      consoleError.mockRestore();
    });
  });
});
