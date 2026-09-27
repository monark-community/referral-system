// Purpose: Unit tests for the auth middleware (JWT check, user lookup, disabled accounts)
// Notes:
// - Mocks Prisma and the JWT helper so each branch can be driven directly

import { authMiddleware } from "@/middlewares/auth.middleware.js";
import { verifyJWT } from "@/services/auth.service.js";
import { prisma } from "@/lib/prisma.js";

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("@/services/auth.service", () => ({
  verifyJWT: jest.fn(),
}));

const activeUser = {
  id: "user1",
  walletAddress: "0xabc",
  disabledAt: null,
  referralCode: "ABC123",
};
const disabledUser = { ...activeUser, disabledAt: new Date("2026-01-01") };

// A request carrying a bearer token
function authedRequest(method = "GET", path = "/profile"): any {
  return { headers: { authorization: "Bearer good-token" }, method, path };
}

describe("authMiddleware", () => {
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    (verifyJWT as jest.Mock).mockReturnValue({ userId: "user1" });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeUser);
  });

  test("rejects a request with no token", async () => {
    await authMiddleware({ headers: {} } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects a header that is not a Bearer token", async () => {
    await authMiddleware({ headers: { authorization: "Basic abc" } } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects an invalid or expired token", async () => {
    (verifyJWT as jest.Mock).mockReturnValue(null);

    await authMiddleware(authedRequest(), res, next);

    expect(verifyJWT).toHaveBeenCalledWith("good-token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects a token for a user that no longer exists", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await authMiddleware(authedRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    expect(next).not.toHaveBeenCalled();
  });

  test("attaches the user and calls next for a valid token", async () => {
    const req = authedRequest();

    await authMiddleware(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user1" },
      select: {
        id: true,
        walletAddress: true,
        disabledAt: true,
        referralCode: true,
      },
    });
    expect(req.user).toEqual(activeUser);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks a disabled account from changing data", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(disabledUser);

    await authMiddleware(authedRequest("POST", "/referrals/private"), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Account is disabled" });
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    ["GET", "/profile"],
    ["POST", "/enable"],
    ["POST", "/verify-email/send"],
  ])("lets a disabled account through for %s %s", async (method, path) => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(disabledUser);

    await authMiddleware(authedRequest(method, path), res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("fails closed when the database lookup throws", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error("db down"));

    await authMiddleware(authedRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
    expect(next).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
