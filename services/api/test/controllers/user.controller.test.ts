import {
  getProfile,
  updateProfile,
  sendVerificationEmail,
  validateReferralCode,
  verifyEmail,
  disableAccount,
  enableAccount,
  getInvites,
} from "@/controllers/user.controller.js";
import { prisma } from "@/lib/prisma.js";
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
    },
    referral: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

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

  test("validateRefferalCode should fail on invalid code", async () => {
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
    req = {user: { id: "user1", walletAddress: "abcd-1234-defg-5678" }};

    (prisma.referral.findMany as jest.Mock).mockReturnValue(null);

    await getInvites(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "No invites found",
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("getInvites should disable user", async () => {
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
});
