// Purpose: Serves campaign definitions and the authenticated user's fulfillment status
// Notes:
// - Definition reads remain public; fulfillment reads require the existing JWT middleware
// - VERIFIED reads may attempt one safe refresh but always return the latest durable status
// - User campaigns are listed and looked up beside the built-in one; drafts stay hidden from these
//   public reads (their creator sees them under /mine, see manualCampaign.controller.ts)
// - A private campaign is not found by its id; it opens only through /private/:code, the code in its link

import type { Request, Response } from "express";
import { createClient } from "@reffinity/blockchain-connector/clients";
import type { BuiltinReferralCampaignDefinition } from "../models/campaign.js";
import {
  CampaignServiceError,
  getBuiltinReferralCampaign,
} from "../services/campaign.service.js";
import {
  getCurrentBuiltinReferralFulfillment,
  refreshCurrentBuiltinReferralFulfillment,
  type CampaignFulfillmentReadClient,
  type CurrentCampaignFulfillment,
} from "../services/campaignFulfillment.service.js";
import {
  countSpotsTaken,
  findManualCampaign,
  findPrivateManualCampaign,
  getMyManualCampaignFulfillment,
  listOpenManualCampaigns,
  refreshManualCampaignFunding,
} from "../services/manualCampaign.service.js";
import {
  manualCampaignDetail,
  manualCampaignSummary,
  manualFulfillmentResponse,
} from "./manualCampaign.controller.js";

// A user campaign other people may open by its id: a public one past draft
async function findPublicManualCampaign(idOrKey: string) {
  const campaign = await findManualCampaign(idOrKey);
  return campaign && campaign.status !== "DRAFT" && !campaign.isPrivate ? refreshManualCampaignFunding(campaign) : null;
}

function campaignSummary(campaign: BuiltinReferralCampaignDefinition) {
  return {
    id: campaign.id,
    key: campaign.key,
    title: campaign.title,
    description: campaign.description,
    status: campaign.status,
    isSystem: campaign.isSystem,
    schemaVersion: campaign.schemaVersion,
  };
}

function campaignDetail(campaign: BuiltinReferralCampaignDefinition) {
  return {
    ...campaignSummary(campaign),
    task: {
      id: campaign.task.id,
      type: campaign.task.type,
      strategyKey: campaign.task.strategyKey,
      schemaVersion: campaign.task.schemaVersion,
      configuration: campaign.task.configuration,
      verificationPolicy: {
        id: campaign.task.verificationPolicy.id,
        type: campaign.task.verificationPolicy.type,
        strategyKey: campaign.task.verificationPolicy.strategyKey,
        schemaVersion: campaign.task.verificationPolicy.schemaVersion,
        configuration: campaign.task.verificationPolicy.configuration,
      },
      rewardPolicy: {
        id: campaign.task.rewardPolicy.id,
        type: campaign.task.rewardPolicy.type,
        strategyKey: campaign.task.rewardPolicy.strategyKey,
        schemaVersion: campaign.task.rewardPolicy.schemaVersion,
        configuration: campaign.task.rewardPolicy.configuration,
      },
    },
  };
}

function fulfillmentResponse(
  campaign: BuiltinReferralCampaignDefinition,
  fulfillment: CurrentCampaignFulfillment,
) {
  return {
    id: fulfillment.id,
    campaignId: campaign.id,
    taskId: fulfillment.taskId,
    referralId: fulfillment.referralId,
    attempt: fulfillment.attempt,
    status: fulfillment.status,
    chainId: fulfillment.chainId,
    verification: fulfillment.verificationTransactionHash
      ? {
          transactionHash: fulfillment.verificationTransactionHash,
          blockNumber: fulfillment.verificationBlockNumber?.toString() ?? null,
          logIndex: fulfillment.verificationLogIndex,
          observedAt: fulfillment.verifiedAt?.toISOString() ?? null,
        }
      : null,
    reward: fulfillment.rewardTransactionHash
      ? {
          transactionHash: fulfillment.rewardTransactionHash,
          blockNumber: fulfillment.rewardBlockNumber?.toString() ?? null,
          logIndex: fulfillment.rewardLogIndex,
          observedAt: fulfillment.rewardedAt?.toISOString() ?? null,
        }
      : null,
  };
}

function handleReadError(error: unknown, res: Response, fallback: string): void {
  console.error(fallback, error);
  if (error instanceof CampaignServiceError) {
    res.status(503).json({ error: "Campaign configuration unavailable" });
    return;
  }
  res.status(500).json({ error: fallback });
}

export async function getCampaigns(_req: Request, res: Response): Promise<void> {
  try {
    const campaign = await getBuiltinReferralCampaign();
    // The board: user campaigns that are taking submissions, after the built-in one
    const open = await listOpenManualCampaigns();
    const spotsTaken = await countSpotsTaken(open.map((manual) => manual.taskId));
    res.json({
      campaigns: [
        campaignSummary(campaign),
        ...open.map((manual) => manualCampaignSummary(manual, spotsTaken.get(manual.taskId) ?? 0)),
      ],
    });
  } catch (error) {
    handleReadError(error, res, "Failed to get campaigns");
  }
}

export async function getCampaign(req: Request, res: Response): Promise<void> {
  try {
    const manual = await findPublicManualCampaign(String(req.params.idOrKey));
    if (manual) {
      const spotsTaken = await countSpotsTaken([manual.taskId]);
      res.json({ campaign: manualCampaignDetail(manual, spotsTaken.get(manual.taskId) ?? 0) });
      return;
    }

    const campaign = await getBuiltinReferralCampaign();
    const idOrKey = req.params.idOrKey;
    if (idOrKey !== campaign.id && idOrKey !== campaign.key) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json({ campaign: campaignDetail(campaign) });
  } catch (error) {
    handleReadError(error, res, "Failed to get campaign");
  }
}

/** GET /api/campaigns/private/:code - A private campaign, opened through its link; no login needed */
export async function getPrivateCampaign(req: Request, res: Response): Promise<void> {
  try {
    const manual = await findPrivateManualCampaign(String(req.params.code));
    // Like a public campaign, its link works once the chain has it
    if (!manual || manual.status === "DRAFT") {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const spotsTaken = await countSpotsTaken([manual.taskId]);
    res.json({ campaign: manualCampaignDetail(manual, spotsTaken.get(manual.taskId) ?? 0) });
  } catch (error) {
    handleReadError(error, res, "Failed to get campaign");
  }
}

export async function getMyCampaignFulfillment(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const manual = await findManualCampaign(String(req.params.idOrKey));
    if (manual && manual.status !== "DRAFT") {
      const mine = await getMyManualCampaignFulfillment(req.user.id, manual);
      // A private campaign answers only its creator and the people who joined it through its link
      if (!manual.isPrivate || mine || manual.ownerId === req.user.id) {
        res.json({ fulfillment: mine ? manualFulfillmentResponse(manual, mine) : null });
        return;
      }
    }

    const campaign = await getBuiltinReferralCampaign();
    const idOrKey = req.params.idOrKey;
    if (idOrKey !== campaign.id && idOrKey !== campaign.key) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    let fulfillment = await getCurrentBuiltinReferralFulfillment(
      campaign.task.id,
      req.user.id,
    );
    if (fulfillment?.status === "VERIFIED") {
      try {
        const client = createClient(
          process.env.CHAIN_TYPE as "localhost" | "sepolia",
        ).publicClient as unknown as CampaignFulfillmentReadClient;
        fulfillment = await refreshCurrentBuiltinReferralFulfillment(
          client,
          fulfillment,
          (error) =>
            console.warn("Campaign fulfillment read-through incomplete", {
              fulfillmentId: fulfillment?.id,
              message: error instanceof Error ? error.message : String(error),
            }),
        );
      } catch (error) {
        console.warn("Campaign fulfillment read-through unavailable", {
          fulfillmentId: fulfillment.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({
      fulfillment: fulfillment
        ? fulfillmentResponse(campaign, fulfillment)
        : null,
    });
  } catch (error) {
    handleReadError(error, res, "Failed to get campaign fulfillment");
  }
}
