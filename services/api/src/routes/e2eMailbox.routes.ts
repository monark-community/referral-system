import { Router, type RequestHandler } from "express";
import {
  clearE2EEmails,
  listE2EEmails,
} from "../services/e2eMailbox.service.js";

const router = Router();

const requireMailboxKey: RequestHandler = (req, res, next) => {
  if (req.header("x-e2e-mailbox-key") !== process.env.E2E_MAILBOX_KEY) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
};

router.get("/emails", requireMailboxKey, (req, res) => {
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  res.json({ messages: listE2EEmails(to) });
});

router.delete("/emails", requireMailboxKey, (_req, res) => {
  clearE2EEmails();
  res.status(204).end();
});

export default router;
