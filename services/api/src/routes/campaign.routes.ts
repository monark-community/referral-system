// Purpose: Campaign API routes for public definitions, authenticated fulfillment status, and user campaigns
// Notes:
// - Keeps campaign reads additive and leaves all existing referral routes unchanged
// - Manual reconciliation is intentionally not exposed
// - Fixed paths like /mine come before /:idOrKey so they are not read as a campaign id

import { Router } from "express";
import {
  getCampaign,
  getCampaigns,
  getMyCampaignFulfillment,
} from "../controllers/campaign.controller.js";
import {
  approveCampaignSubmission,
  changeCampaignStatus,
  createCampaign,
  getCampaignSubmissions,
  getMyCampaigns,
  getMyDirectRewards,
  prepareMyDirectRewardWithdrawal,
  prepareCampaignFunding,
  rejectCampaignSubmission,
  submitCampaignProof,
  updateCampaign,
} from "../controllers/manualCampaign.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// GET /api/campaigns - The built-in campaign and user campaigns taking submissions
router.get("/", getCampaigns);
// POST /api/campaigns - Save a new user campaign as a draft
router.post("/", authMiddleware, createCampaign);
// GET /api/campaigns/mine - Campaigns you created, and the ones you submitted to
router.get("/mine", authMiddleware, getMyCampaigns);
// Fixed reward routes must precede /:idOrKey.
router.get("/rewards/direct/me", authMiddleware, getMyDirectRewards);
router.post("/rewards/direct/withdraw", authMiddleware, prepareMyDirectRewardWithdrawal);
router.get(
  "/:idOrKey/fulfillments/me",
  authMiddleware,
  getMyCampaignFulfillment,
);
// GET /api/campaigns/:id/fulfillments - The creator's review queue
router.get("/:id/fulfillments", authMiddleware, getCampaignSubmissions);
// POST /api/campaigns/:id/fulfillments - Submit proof
router.post("/:id/fulfillments", authMiddleware, submitCampaignProof);
router.post(
  "/:id/fulfillments/:fulfillmentId/approve",
  authMiddleware,
  approveCampaignSubmission,
);
router.post(
  "/:id/fulfillments/:fulfillmentId/reject",
  authMiddleware,
  rejectCampaignSubmission,
);
// POST /api/campaigns/:id/status - Pause, resume, end or cancel
router.post("/:id/status", authMiddleware, changeCampaignStatus);
router.post("/:id/funding", authMiddleware, prepareCampaignFunding);
// PATCH /api/campaigns/:id - Edit a draft
router.patch("/:id", authMiddleware, updateCampaign);
router.get("/:idOrKey", getCampaign);

export default router;
