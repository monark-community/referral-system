// Purpose: HTTP-level tests that send requests through the whole Express app (routes, middleware, controllers)
// Notes:
// - Uses supertest to send requests in memory, with no real server, port, or network
// - Prisma is mocked; login tokens are real JWTs, so the real auth middleware runs

import request from "supertest";
import app from "@/app.js";
import { prisma } from "@/lib/prisma.js";
import { generateJWT } from "@/services/auth.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    referralPointAllocation: { findMany: jest.fn() },
    milestoneTier: { findMany: jest.fn() },
  },
}));
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({ uuidToBytes32: jest.fn() }),
  { virtual: true },
);

// The mocked Prisma client, untyped so tests can set return values freely
const db = prisma as any;

const user = {
  id: "user1",
  walletAddress: "0xabc",
  disabledAt: null,
  referralCode: "ABC123",
};

// Authorization header for a logged-in user, using a real signed token
function loggedIn() {
  return { Authorization: `Bearer ${generateJWT(user.id, user.walletAddress)}` };
}

describe("API routes", () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockReset().mockResolvedValue(user);
    db.user.findFirst.mockReset();
    db.user.update.mockReset();
    db.user.findMany.mockReset().mockResolvedValue([]);
    db.referralPointAllocation.findMany.mockReset().mockResolvedValue([]);
    db.milestoneTier.findMany.mockReset();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  describe("app setup", () => {
    test("GET /health reports the API is up", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", timestamp: expect.any(String) });
    });

    test("responses carry security headers", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    test("allows requests from the web app's address", async () => {
      const frontend = process.env.FRONTEND_URL || "http://localhost:3000";

      const res = await request(app).get("/health").set("Origin", frontend);

      expect(res.headers["access-control-allow-origin"]).toBe(frontend);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    test("unknown paths return 404", async () => {
      const res = await request(app).get("/api/does-not-exist");

      expect(res.status).toBe(404);
    });

    test("a malformed JSON body gets a 400 from the error middleware", async () => {
      const res = await request(app)
        .post("/api/auth/wallet")
        .set("Content-Type", "application/json")
        .send("{bad json");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("protected routes", () => {
    // Every endpoint that needs a login, as registered in the route files
    test.each([
      ["get", "/api/auth/me"],
      ["post", "/api/auth/logout"],
      ["get", "/api/users/profile"],
      ["put", "/api/users/profile"],
      ["post", "/api/users/verify-email/send"],
      ["post", "/api/users/accept-terms"],
      ["get", "/api/users/referrals"],
      ["get", "/api/users/referral-rewards"],
      ["post", "/api/users/disable"],
      ["post", "/api/users/enable"],
      ["post", "/api/users/referrals/private"],
      ["get", "/api/milestones/user"],
    ] as const)("%s %s requires a login", async (method, path) => {
      const res = await request(app)[method](path);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "No token provided" });
    });

    test("a logged-in user gets their profile through the full chain", async () => {
      const res = await request(app).get("/api/users/profile").set(loggedIn());

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: "user1", walletAddress: "0xabc" });
    });

    test("a disabled account can read but not change data", async () => {
      db.user.findUnique.mockResolvedValue({ ...user, disabledAt: "2026-01-01T00:00:00.000Z" });

      const read = await request(app).get("/api/users/profile").set(loggedIn());
      const write = await request(app).post("/api/users/referrals/private").set(loggedIn());

      expect(read.status).toBe(200);
      expect(write.status).toBe(403);
      expect(write.body).toEqual({ error: "Account is disabled" });
    });

    test("PUT /api/users/profile checks the input before saving it", async () => {
      const res = await request(app)
        .put("/api/users/profile")
        .set(loggedIn())
        .send({ name: "Alice", email: "not-an-email" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });

  describe("public routes", () => {
    test("POST /api/auth/wallet checks the input before logging in", async () => {
      const res = await request(app).post("/api/auth/wallet").send({ walletAddress: "0x123" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    test("GET /api/milestones/tiers works without a login", async () => {
      db.milestoneTier.findMany.mockResolvedValue([
        { level: 1, name: "Bronze", pointsRequired: 100, benefits: [] },
      ]);

      const res = await request(app).get("/api/milestones/tiers");

      expect(res.status).toBe(200);
      expect(res.body.tiers).toHaveLength(1);
    });

    test("GET /api/users/referral/:code works without a login", async () => {
      db.user.findUnique.mockResolvedValue({ id: "referrer1", walletAddress: "0xref" });

      const res = await request(app).get("/api/users/referral/abc123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ walletAddress: "0xref" });
    });

    test("GET /api/users/verify-email/:token redirects back to the web app", async () => {
      db.user.findFirst.mockResolvedValue(null);

      const res = await request(app).get("/api/users/verify-email/bad-token");

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/referrals/email-verified?error=invalid");
    });
  });
});
