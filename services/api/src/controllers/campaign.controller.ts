// Purpose: Serves built-in campaign definitions and the authenticated user's fulfillment status
// Notes:
// - Definition reads remain public; fulfillment reads require the existing JWT middleware
// - VERIFIED reads may attempt one safe refresh but always return the latest durable status

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
    res.json({ campaigns: [campaignSummary(campaign)] });
  } catch (error) {
    handleReadError(error, res, "Failed to get campaigns");
  }
}

export async function getCampaign(req: Request, res: Response): Promise<void> {
  try {
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

export async function getMyCampaignFulfillment(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
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
