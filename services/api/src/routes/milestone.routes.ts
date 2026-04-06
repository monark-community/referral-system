// Purpose: Milestone API routes exposing public tier definitions and authenticated user milestone progress

import { Router } from "express";
import {
  getMilestoneTiers,
  getUserMilestone,
} from "../controllers/milestone.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// GET /api/milestones/tiers - Get all milestone tier definitions (public)
router.get("/tiers", getMilestoneTiers);

// GET /api/milestones/user - Get current user's milestone progress
router.get("/user", authMiddleware, getUserMilestone);

export default router;
