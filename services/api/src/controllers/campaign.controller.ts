import type { Request, Response } from "express";
import type { BuiltinReferralCampaignDefinition } from "../models/campaign.js";
import {
  CampaignServiceError,
  getBuiltinReferralCampaign,
} from "../services/campaign.service.js";

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
