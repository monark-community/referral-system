// Purpose: Defines and validates user campaigns: one manually verified bounty task paying a points reward
// Notes:
// - Matches the on-chain Bounty + Manual + Points combination; the chain pays the reward when the creator verifies
// - Instructions, limits and proof stay in the database; only IDs, statuses and payouts go on chain
// - Stored campaigns are parsed strictly, like the built-in referral campaign, so a bad row fails loudly

export const BOUNTY_TASK_STRATEGY = "BOUNTY_V1" as const;
export const OWNER_APPROVAL_STRATEGY = "OWNER_APPROVAL_V1" as const;
export const CAMPAIGN_POINTS_STRATEGY = "CAMPAIGN_POINTS_V1" as const;
export const CAMPAIGN_DIRECT_NATIVE_STRATEGY = "CAMPAIGN_DIRECT_NATIVE_V1" as const;

// The contract's enum values for a createCampaign call
export const CHAIN_TASK_TYPE_BOUNTY = 1;
export const CHAIN_VERIFICATION_TYPE_MANUAL = 1;
export const CHAIN_REWARD_TYPE_POINTS = 0;
export const CHAIN_REWARD_TYPE_DIRECT = 1;

// Social media proof is a link to the post or profile; community proof is a username or short text
export const BOUNTY_CATEGORIES = ["SOCIAL_MEDIA", "COMMUNITY"] as const;
export type BountyCategory = (typeof BOUNTY_CATEGORIES)[number];

export const MANUAL_CAMPAIGN_LIMITS = {
  title: 120,
  description: 500,
  instructions: 2000,
  proof: 500,
  rejectionReason: 500,
} as const;

export type ManualCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELLED";

type ManualCampaignCommonInput = {
  title: string;
  description: string;
  instructions: string;
  category: BountyCategory;
  maxCompletions: number;
  endsAt: Date;
};

export type PointsManualCampaignInput = ManualCampaignCommonInput & {
  rewardType: "POINTS";
  completerPoints: number;
  referralPoolPoints: number;
};

export type DirectManualCampaignInput = ManualCampaignCommonInput & {
  rewardType: "DIRECT";
  completerRewardWei: string;
  referralPoolWei: string;
  initialFundingRuns: number;
};

export type ManualCampaignInput = PointsManualCampaignInput | DirectManualCampaignInput;

export type ManualCampaignDefinition = ManualCampaignInput & {
  id: string;
  key: string;
  ownerId: string;
  owner: { name: string | null; walletAddress: string };
  status: ManualCampaignStatus;
  taskId: string;
  rewardPolicyId: string;
  publishedAt: Date | null;
  chainStatus: string | null;
  chainBalanceWei: string | null;
  createdAt: Date;
};

export const UINT256_MAX = (1n << 256n) - 1n;

export function parseWei(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ManualCampaignValidationError(field, "must be an unsigned base-10 integer string");
  }
  const amount = BigInt(value);
  if (amount > UINT256_MAX) {
    throw new ManualCampaignValidationError(field, "must fit in uint256");
  }
  return amount.toString();
}

export function directRewardPerRunWei(campaign: Pick<DirectManualCampaignInput, "completerRewardWei" | "referralPoolWei">): bigint {
  return BigInt(campaign.completerRewardWei) + BigInt(campaign.referralPoolWei);
}

export class ManualCampaignValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "ManualCampaignValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ManualCampaignValidationError(field, "must be an object");
  }
  return value as UnknownRecord;
}

function requireText(value: unknown, field: string, maxLength: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string") {
    throw new ManualCampaignValidationError(field, "must be a string");
  }
  const text = value.trim();
  if (!optional && text.length === 0) {
    throw new ManualCampaignValidationError(field, "must not be empty");
  }
  if (text.length > maxLength) {
    throw new ManualCampaignValidationError(field, `must be at most ${maxLength} characters`);
  }
  return text;
}

function requireWholeNumber(value: unknown, field: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new ManualCampaignValidationError(field, `must be a whole number of at least ${minimum}`);
  }
  return value;
}

function requireCategory(value: unknown, field: string): BountyCategory {
  if (!BOUNTY_CATEGORIES.includes(value as BountyCategory)) {
    throw new ManualCampaignValidationError(field, `must be one of ${BOUNTY_CATEGORIES.join(", ")}`);
  }
  return value as BountyCategory;
}

/**
 * Validates a whole campaign as the creator sends it. For an edit, pass the stored campaign as `current`:
 * fields left out keep their stored value, and the merged result is validated as a whole.
 */
export function parseManualCampaignInput(
  value: unknown,
  { now = new Date(), current }: { now?: Date; current?: ManualCampaignInput } = {},
): ManualCampaignInput {
  const body = requireRecord(value, "body");
  const previous = current as unknown as UnknownRecord | undefined;
  const field = (name: string) => body[name] === undefined && previous ? previous[name] : body[name];

  const rewardTypeValue = body.rewardType === undefined ? current?.rewardType ?? "POINTS" : body.rewardType;
  if (rewardTypeValue !== "POINTS" && rewardTypeValue !== "DIRECT") {
    throw new ManualCampaignValidationError("rewardType", "must be POINTS or DIRECT");
  }

  const endsAtValue = field("endsAt");
  if (typeof endsAtValue !== "string" && !(endsAtValue instanceof Date)) {
    throw new ManualCampaignValidationError("endsAt", "must be an ISO date");
  }
  const endsAt = new Date(endsAtValue);
  if (Number.isNaN(endsAt.getTime())) {
    throw new ManualCampaignValidationError("endsAt", "must be an ISO date");
  }
  if (endsAt.getTime() <= now.getTime()) {
    throw new ManualCampaignValidationError("endsAt", "must be in the future");
  }

  const common = {
    title: requireText(field("title"), "title", MANUAL_CAMPAIGN_LIMITS.title),
    description: requireText(field("description"), "description", MANUAL_CAMPAIGN_LIMITS.description, true),
    instructions: requireText(field("instructions"), "instructions", MANUAL_CAMPAIGN_LIMITS.instructions),
    category: requireCategory(field("category"), "category"),
    maxCompletions: requireWholeNumber(field("maxCompletions"), "maxCompletions", 1),
    endsAt,
  };

  if (rewardTypeValue === "POINTS") {
    if (body.completerRewardWei !== undefined || body.referralPoolWei !== undefined || body.initialFundingRuns !== undefined) {
      throw new ManualCampaignValidationError("rewardType", "POINTS campaigns cannot include Direct reward fields");
    }
    const completerPoints = requireWholeNumber(field("completerPoints"), "completerPoints", 0);
    const referralPoolPoints = requireWholeNumber(field("referralPoolPoints"), "referralPoolPoints", 0);
    if (completerPoints + referralPoolPoints === 0) {
      throw new ManualCampaignValidationError("completerPoints", "the campaign must pay at least one point");
    }
    return { ...common, rewardType: "POINTS", completerPoints, referralPoolPoints };
  }

  if (body.completerPoints !== undefined || body.referralPoolPoints !== undefined) {
    throw new ManualCampaignValidationError("rewardType", "DIRECT campaigns cannot include Points reward fields");
  }
  const completerRewardWei = parseWei(field("completerRewardWei"), "completerRewardWei");
  const referralPoolWei = parseWei(field("referralPoolWei"), "referralPoolWei");
  if (BigInt(completerRewardWei) + BigInt(referralPoolWei) === 0n) {
    throw new ManualCampaignValidationError("completerRewardWei", "the campaign must pay at least one wei");
  }
  return {
    ...common,
    rewardType: "DIRECT",
    completerRewardWei,
    referralPoolWei,
    initialFundingRuns: requireWholeNumber(field("initialFundingRuns"), "initialFundingRuns", 1),
  };
}

/** A submission's proof: a link for social media tasks, a username or short text for community ones. */
export function parseProof(category: BountyCategory, value: unknown): string {
  const proof = requireText(value, "proof", MANUAL_CAMPAIGN_LIMITS.proof);
  if (category === "SOCIAL_MEDIA") {
    let url: URL;
    try {
      url = new URL(proof);
    } catch {
      throw new ManualCampaignValidationError("proof", "must be a link to the post or profile");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ManualCampaignValidationError("proof", "must be an http or https link");
    }
  }
  return proof;
}

export function parseRejectionReason(value: unknown): string {
  return requireText(value, "reason", MANUAL_CAMPAIGN_LIMITS.rejectionReason);
}

// ---------- Stored campaigns ----------

export class ManualCampaignDataError extends Error {
  constructor(
    public readonly campaignId: string,
    message: string,
  ) {
    super(`Campaign ${campaignId} is not a valid user campaign: ${message}`);
    this.name = "ManualCampaignDataError";
  }
}

export type StoredManualCampaign = {
  id: string;
  key: string;
  title: string;
  description: string;
  instructions: string;
  isSystem: boolean;
  status: string;
  ownerId: string | null;
  owner: { name: string | null; walletAddress: string } | null;
  maxCompletions: number | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  chainStatus?: string | null;
  chainBalanceWei?: string | null;
  createdAt: Date;
  task: {
    id: string;
    type: string;
    strategyKey: string;
    configuration: unknown;
    verificationPolicy: { type: string; strategyKey: string } | null;
    rewardPolicy: { id: string; type: string; strategyKey: string; configuration: unknown } | null;
  } | null;
};

const MANUAL_STATUSES: readonly string[] = ["DRAFT", "ACTIVE", "PAUSED", "ENDED", "CANCELLED"];

export function parseStoredManualCampaign(row: StoredManualCampaign): ManualCampaignDefinition {
  const fail = (message: string): never => {
    throw new ManualCampaignDataError(row.id, message);
  };
  if (row.isSystem || !row.ownerId || !row.owner) fail("it has no owner");
  if (!MANUAL_STATUSES.includes(row.status)) fail(`status ${row.status} is not a user campaign state`);
  if (row.maxCompletions === null || row.endsAt === null) fail("it has no completion limit or end date");

  const task = row.task ?? fail("it has no task");
  if (task.type !== "BOUNTY" || task.strategyKey !== BOUNTY_TASK_STRATEGY) fail("its task is not a bounty");
  const verification = task.verificationPolicy ?? fail("it has no verification policy");
  if (verification.type !== "MANUAL" || verification.strategyKey !== OWNER_APPROVAL_STRATEGY) {
    fail("its verification is not manual");
  }
  const reward = task.rewardPolicy ?? fail("it has no reward policy");
  const taskConfiguration = task.configuration as UnknownRecord | null;
  const rewardConfiguration = reward.configuration as UnknownRecord | null;
  const category = taskConfiguration?.category;
  if (!BOUNTY_CATEGORIES.includes(category as BountyCategory)) fail("its task has no valid category");
  const common = {
    id: row.id,
    key: row.key,
    ownerId: row.ownerId!,
    owner: { name: row.owner!.name, walletAddress: row.owner!.walletAddress },
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    status: row.status as ManualCampaignStatus,
    category: category as BountyCategory,
    maxCompletions: row.maxCompletions!,
    endsAt: row.endsAt!,
    taskId: task.id,
    rewardPolicyId: reward.id,
    publishedAt: row.publishedAt,
    chainStatus: row.chainStatus ?? null,
    chainBalanceWei: row.chainBalanceWei ?? null,
    createdAt: row.createdAt,
  };

  if (reward.type === "POINTS" && reward.strategyKey === CAMPAIGN_POINTS_STRATEGY) {
    const completerPoints = rewardConfiguration?.completerPoints;
    const referralPoolPoints = rewardConfiguration?.referralPoolPoints;
    if (!Number.isSafeInteger(completerPoints) || !Number.isSafeInteger(referralPoolPoints)) {
      fail("its reward has no valid point amounts");
    }
    return { ...common, rewardType: "POINTS", completerPoints: completerPoints as number, referralPoolPoints: referralPoolPoints as number };
  }
  if (reward.type === "DIRECT" && reward.strategyKey === CAMPAIGN_DIRECT_NATIVE_STRATEGY) {
    try {
      const completerRewardWei = parseWei(rewardConfiguration?.completerRewardWei, "completerRewardWei");
      const referralPoolWei = parseWei(rewardConfiguration?.referralPoolWei, "referralPoolWei");
      const initialFundingRuns = requireWholeNumber(rewardConfiguration?.initialFundingRuns, "initialFundingRuns", 1);
      if (BigInt(completerRewardWei) + BigInt(referralPoolWei) === 0n) fail("its Direct reward is zero");
      return { ...common, rewardType: "DIRECT", completerRewardWei, referralPoolWei, initialFundingRuns };
    } catch (error) {
      if (error instanceof ManualCampaignDataError) throw error;
      fail("its reward has invalid Direct amounts");
    }
  }
  return fail("its reward type or strategy is unsupported");
}
