import { walletAuth, getMe, logout } from "@/controllers/auth.controller.js";
import { prisma } from "@/lib/prisma.js";
import {
  verifyWalletSignature,
  generateReferralCode,
  generateJWT,
} from "@/services/auth.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    referral: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/services/auth.service");
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({
    uuidToBytes32: jest.fn(),
  }),
  { virtual: true },
);

var res: any;
var req: any;

describe("Test auth controller", () => {
  beforeEach(() => {
    // Mock request and response objects

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock the service functions
    (verifyWalletSignature as jest.Mock).mockReturnValue(true);
    (generateReferralCode as jest.Mock).mockReturnValue("REFERRAL123");
    (generateJWT as jest.Mock).mockReturnValue("JWT_TOKEN");
    const { uuidToBytes32 } = jest.requireMock(
      "@reffinity/blockchain-connector/uuidBytesConverter",
    ) as { uuidToBytes32: jest.Mock };

    uuidToBytes32.mockReturnValue("BYTES32");

    // Mock the database operations
    (prisma.user.create as jest.Mock).mockReturnValue({
      id: "user1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      referralCode: "REFERRAL123",
      referredBy: "referrer123",
      termsAcceptedAt: null,
    });
    (prisma.referral.create as jest.Mock).mockReturnValue({
      id: "referral1",
      userId: "user1",
      referralCode: "REFERRAL123",
    });
  });

  test("should authenticate with wallet signature and create user if new", async () => {
    // for this fuctin the findUnique returns different values
    req = {
      body: {
        walletAddress: "0x1234567890123456789012345678901234567890",
        signature: "0xabcdef",
        message: "Sign this message to authenticate",
        referralCode: "REFERRAL123",
      },
    };
    const mockReferrer = {
      id: "referrer123",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    };
    (prisma.user.findUnique as jest.Mock)
      // 1st call: check if user exists → new user
      .mockResolvedValueOnce(null)
      // 2nd call: check if referral code exists → valid referrer
      .mockResolvedValueOnce(null)
      // 3rd call: ensure new user's referral code is unique → no collision
      .mockResolvedValueOnce(mockReferrer);

    // Call the controller function
    await walletAuth(req, res);

    // expect the functions to be called with correct parameters
    expect(verifyWalletSignature).toHaveBeenCalledWith(
      req.body.message,
      req.body.signature,
      req.body.walletAddress,
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { walletAddress: req.body.walletAddress.toLowerCase() },
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { referralCode: req.body.referralCode.toUpperCase() },
      select: { id: true, walletAddress: true },
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        walletAddress: req.body.walletAddress.toLowerCase(),
        referralCode: "REFERRAL123",
        referredBy: mockReferrer.id,
        termsAcceptedAt: null,
      },
    });

    expect(prisma.referral.create).toHaveBeenCalledWith({
      data: {
        refereeId: "user1",
        referrerId: "referrer123",
        status: 0,
        points: 0,
      },
    });

    expect(generateJWT).toHaveBeenCalledWith(
      "user1",
      req.body.walletAddress.toLowerCase(),
    );
  });

  test("should throw 401 error if wallet signature is invalid", async () => {
    req = {
      body: {
        walletAddress: "0x1234567890123456789012345678901234567890",
        signature: "0xabcdef",
        message: "Sign this message to authenticate",
        referralCode: "REFERRAL123",
      },
    };
    // Mock the verifyWalletSignature function to return false
    (verifyWalletSignature as jest.Mock).mockReturnValue(false);

    // Call the controller function
    await walletAuth(req, res);

    // expect the functions to be called with correct parameters
    expect(verifyWalletSignature).toHaveBeenCalledWith(
      req.body.message,
      req.body.signature,
      req.body.walletAddress,
    );

    // expect the response to be a 401 error
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid signature",
    });
  });

  test("getMe should return the user if it exists", async () => {
    req = { user: { id: "user1" } };
    // for this fuctin the findUnique returns different values
    const mockReferrer = {
      id: "user1",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      name: "John Doe",
      email: "fake@yahoo.com",
      phone: "1234567890",
      emailVerified: true,
      referralCode: "REFERRAL123",
      earnedPoints: 100,
      pendingPoints: 50,
      milestoneLevel: 2,
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(mockReferrer);

    // Call the controller function
    await getMe(req, res);

    // expect the functions to be called with correct parameters
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
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
    // expect the response to contain user data
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: mockReferrer.id,
        walletAddress: mockReferrer.walletAddress,
        name: mockReferrer.name,
        email: mockReferrer.email,
        phone: mockReferrer.phone,
        emailVerified: mockReferrer.emailVerified,
        referralCode: mockReferrer.referralCode,
        earnedPoints: mockReferrer.earnedPoints,
        pendingPoints: mockReferrer.pendingPoints,
        milestoneLevel: mockReferrer.milestoneLevel,
        disabledAt: mockReferrer.disabledAt,
        createdAt: mockReferrer.createdAt,
        updatedAt: mockReferrer.updatedAt,
      },
    });
  });

  test("getMe should return 401 if not authenticated", async () => {
    req = {};

    // Call the controller function
    await getMe(req, res);

    // expect the response to contain user data
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
  });

  test("getMe should return 404 if no user in database", async () => {
    req = { user: { id: "user1" } };

    // Mock the findUnique function to return null
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    // Call the controller function
    await getMe(req, res);

    // expect the response to contain user data
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "User not found",
    });
  });

  test("logout should logout the user", async () => {
    // Call the controller function
    await logout(req, res);
    // expect the response to be successful
    expect(res.json).toHaveBeenCalledWith({
      message: "Logged out successfully",
      success: true,
    });
  });
});
