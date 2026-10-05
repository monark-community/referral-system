import { Router, type RequestHandler } from "express";
import {
  pauseE2EListener,
  resetE2EState,
  restartE2EListener,
} from "../services/e2eReset.service.js";

const router = Router();

const requireResetKey: RequestHandler = (req, res, next) => {
  if (req.header("x-e2e-reset-key") !== process.env.E2E_RESET_KEY) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
};

router.post("/reset", requireResetKey, async (_req, res, next) => {
  try {
    res.json(await resetE2EState());
  } catch (error) {
    next(error);
  }
});

router.post("/listener/pause", requireResetKey, async (_req, res, next) => {
  try {
    res.json(await pauseE2EListener());
  } catch (error) {
    next(error);
  }
});

router.post("/listener/restart", requireResetKey, async (_req, res, next) => {
  try {
    res.json(await restartE2EListener());
  } catch (error) {
    next(error);
  }
});

export default router;
