import { Router } from "express";
import {
  getCampaign,
  getCampaigns,
} from "../controllers/campaign.controller.js";

const router = Router();

router.get("/", getCampaigns);
router.get("/:idOrKey", getCampaign);

export default router;
