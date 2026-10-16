// Purpose: Loads and validates the installed built-in Referral campaign definition
// Notes:
// - Performs read-only configuration access and rejects missing, duplicate, archived, or invalid data

import { prisma } from "../lib/prisma.js";
import {
  BUILTIN_REFERRAL_CAMPAIGN_KEY,
  CampaignValidationError,
  parseBuiltinReferralCampaignDefinition,
  type BuiltinReferralCampaignDefinition,
} from "../models/campaign.js";

export type CampaignServiceErrorCode =
  | "BUILTIN_CAMPAIGN_NOT_FOUND"
  | "DUPLICATE_BUILTIN_CAMPAIGN"
  | "BUILTIN_CAMPAIGN_ARCHIVED"
  | "INVALID_BUILTIN_CAMPAIGN";

export class CampaignServiceError extends Error {
  constructor(
    public readonly code: CampaignServiceErrorCode,
    message: string,
    public readonly validationError?: CampaignValidationError,
  ) {
    super(message);
    this.name = "CampaignServiceError";
  }
}

export async function getBuiltinReferralCampaign(): Promise<BuiltinReferralCampaignDefinition> {
  const matches = await prisma.campaign.findMany({
    where: { key: BUILTIN_REFERRAL_CAMPAIGN_KEY },
    include: {
      task: {
        include: {
          verificationPolicy: true,
          rewardPolicy: true,
        },
      },
    },
    take: 2,
  });

  if (matches.length === 0) {
    throw new CampaignServiceError(
      "BUILTIN_CAMPAIGN_NOT_FOUND",
      `Built-in campaign ${BUILTIN_REFERRAL_CAMPAIGN_KEY} was not found`,
    );
  }
  if (matches.length > 1) {
    throw new CampaignServiceError(
      "DUPLICATE_BUILTIN_CAMPAIGN",
      `Multiple campaigns use the built-in key ${BUILTIN_REFERRAL_CAMPAIGN_KEY}`,
    );
  }

  const campaign = matches[0];
  if (campaign.status === "ARCHIVED") {
    throw new CampaignServiceError(
      "BUILTIN_CAMPAIGN_ARCHIVED",
      `Built-in campaign ${BUILTIN_REFERRAL_CAMPAIGN_KEY} is archived`,
    );
  }

  try {
    return parseBuiltinReferralCampaignDefinition(campaign);
  } catch (error) {
    if (error instanceof CampaignValidationError) {
      throw new CampaignServiceError(
        "INVALID_BUILTIN_CAMPAIGN",
        `Built-in campaign configuration is invalid: ${error.message}`,
        error,
      );
    }
    throw error;
  }
}
