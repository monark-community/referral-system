// Purpose: Campaign API routes for public definitions and authenticated fulfillment status
// Notes:
// - Keeps campaign reads additive and leaves all existing referral routes unchanged
// - Manual reconciliation is intentionally not exposed

import { Router } from "express";
import {
  getCampaign,
  getCampaigns,
  getMyCampaignFulfillment,
} from "../controllers/campaign.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", getCampaigns);
router.get(
  "/:idOrKey/fulfillments/me",
  authMiddleware,
  getMyCampaignFulfillment,
);
router.get("/:idOrKey", getCampaign);

export default router;
