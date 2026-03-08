import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * GET /api/milestones/tiers
 * Get all milestone tier definitions
 */
export async function getMilestoneTiers(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const tiers = await prisma.milestoneTier.findMany({
      orderBy: { level: "asc" },
    });

    res.json({ tiers });
  } catch (error) {
    console.error("Get milestone tiers error:", error);
    res.status(500).json({ error: "Failed to get milestone tiers" });
  }
}

/**
 * GET /api/milestones/user
 * Get current user's milestone progress
 */
export async function getUserMilestone(
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
      select: {
        earnedPoints: true,
        milestoneLevel: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Get all tiers to determine current and next
    const tiers = await prisma.milestoneTier.findMany({
      orderBy: { level: "asc" },
    });

    const currentTier = tiers.find((t) => t.level === user.milestoneLevel) || null;
    const nextTier = tiers.find((t) => t.pointsRequired > user.earnedPoints) || null;

    res.json({
      milestoneLevel: user.milestoneLevel,
      earnedPoints: user.earnedPoints,
      currentTier,
      nextTier,
    });
  } catch (error) {
    console.error("Get user milestone error:", error);
    res.status(500).json({ error: "Failed to get user milestone" });
  }
}
