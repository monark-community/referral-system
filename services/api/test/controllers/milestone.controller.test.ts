// Purpose: Unit tests for milestone controller endpoints (tier listing and user milestone progression)

import {
  getMilestoneTiers,
  getUserMilestone,
} from "@/controllers/milestone.controller.js";
import { prisma } from "@/lib/prisma.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    milestoneTier: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

var res: any;
var req: any;

describe("Testing milestone controller", () => {
  beforeEach(() => {
    // Mock request and response objects

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("getMilestoneTiers should return milestone tiers on request", async () => {
    req = {};

    (prisma.milestoneTier.findMany as jest.Mock).mockReturnValue([
      {
        id: "fakeid",
      },
    ]);

    await getMilestoneTiers(req, res);

    expect(prisma.milestoneTier.findMany).toHaveBeenCalledWith({
      orderBy: { level: "asc" },
    });

    expect(res.json).toHaveBeenCalledWith({
      tiers: [
        {
          id: "fakeid",
        },
      ],
    });
  });

  test("getMilestoneTiers catches error on finding tiers", async () => {
    req = {};

    (prisma.milestoneTier.findMany as jest.Mock).mockImplementation(() => {
      throw new Error("Random Error");
    });

    await getMilestoneTiers(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Failed to get milestone tiers",
    });
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test("getUserMilestone should fail on not authenticated user", async () => {
    req = {};

    await getUserMilestone(req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: "Not authenticated",
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("getUserMilestone should return no user found", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue(null);

    await getUserMilestone(req, res);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: req.user.id },
      select: {
        earnedPoints: true,
        milestoneLevel: true,
      },
    });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
  });

  test("getUserMilestone should return user milestone status", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      earnedPoints: 50,
      milestoneLevel: 1,
    });
    (prisma.milestoneTier.findMany as jest.Mock).mockReturnValue([
      {
        level: 1,
        pointsRequired: 30,
      },
      {
        level: 2,
        pointsRequired: 100,
      },
    ]);

    await getUserMilestone(req, res);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: req.user.id },
      select: {
        earnedPoints: true,
        milestoneLevel: true,
      },
    });

    expect(prisma.milestoneTier.findMany).toHaveBeenCalledWith({
      orderBy: { level: "asc" },
    });

    expect(res.json).toHaveBeenCalledWith({
      milestoneLevel: 1,
      earnedPoints: 50,
      currentTier: {
        level: 1,
        pointsRequired: 30,
      },
      nextTier: {
        level: 2,
        pointsRequired: 100,
      },
    });
  });

  test("getUserMilestone should catch error on retreval", async () => {
    req = { user: { id: "user1" } };

    (prisma.user.findUnique as jest.Mock).mockReturnValue({
      earnedPoints: 50,
      milestoneLevel: 1,
    });
    (prisma.milestoneTier.findMany as jest.Mock).mockImplementation(() => {
      throw new Error("Random Error");
    });

    await getUserMilestone(req, res);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: req.user.id },
      select: {
        earnedPoints: true,
        milestoneLevel: true,
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      error: "Failed to get user milestone",
    });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
