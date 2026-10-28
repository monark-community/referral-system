// Purpose: Defines and validates user campaigns: one manually verified bounty task paying a points reward
// Notes:
// - Matches the on-chain Bounty + Manual + Points combination; the chain pays the reward when the creator verifies
// - Instructions, limits and proof stay in the database; only IDs, statuses and payouts go on chain
// - A private campaign stays off the board and is opened through one link holding its code; being private
//   is also database-only, so the chain still shows its id, rewards and payouts
// - Stored campaigns are parsed strictly, like the built-in referral campaign, so a bad row fails loudly

export const BOUNTY_TASK_STRATEGY = "BOUNTY_V1" as const;
export const OWNER_APPROVAL_STRATEGY = "OWNER_APPROVAL_V1" as const;
export const CAMPAIGN_POINTS_STRATEGY = "CAMPAIGN_POINTS_V1" as const;

// The contract's enum values for a createCampaign call
export const CHAIN_TASK_TYPE_BOUNTY = 1;
export const CHAIN_VERIFICATION_TYPE_MANUAL = 1;
export const CHAIN_REWARD_TYPE_POINTS = 0;

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

export type ManualCampaignInput = {
  title: string;
  description: string;
  instructions: string;
  category: BountyCategory;
  completerPoints: number;
  referralPoolPoints: number;
  maxCompletions: number;
  endsAt: Date;
  isPrivate: boolean;
};

export type ManualCampaignDefinition = ManualCampaignInput & {
  id: string;
  key: string;
  // Set exactly when the campaign is private
  privateCode: string | null;
  ownerId: string;
  owner: { name: string | null; walletAddress: string };
  status: ManualCampaignStatus;
  taskId: string;
  rewardPolicyId: string;
  publishedAt: Date | null;
  createdAt: Date;
};

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

function optionalBoolean(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ManualCampaignValidationError(field, "must be true or false");
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
  const field = (name: keyof ManualCampaignInput) =>
    body[name] === undefined && current ? current[name] : body[name];

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

  const completerPoints = requireWholeNumber(field("completerPoints"), "completerPoints", 0);
  const referralPoolPoints = requireWholeNumber(field("referralPoolPoints"), "referralPoolPoints", 0);
  if (completerPoints + referralPoolPoints === 0) {
    throw new ManualCampaignValidationError("completerPoints", "the campaign must pay at least one point");
  }

  return {
    title: requireText(field("title"), "title", MANUAL_CAMPAIGN_LIMITS.title),
    description: requireText(field("description"), "description", MANUAL_CAMPAIGN_LIMITS.description, true),
    instructions: requireText(field("instructions"), "instructions", MANUAL_CAMPAIGN_LIMITS.instructions),
    category: requireCategory(field("category"), "category"),
    completerPoints,
    referralPoolPoints,
    maxCompletions: requireWholeNumber(field("maxCompletions"), "maxCompletions", 1),
    endsAt,
    isPrivate: optionalBoolean(field("isPrivate"), "isPrivate"),
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
  isPrivate: boolean;
  privateCode: string | null;
  publishedAt: Date | null;
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
  if (row.isPrivate !== (row.privateCode !== null)) fail("a private campaign needs a code, and only a private one");

  const task = row.task ?? fail("it has no task");
  if (task.type !== "BOUNTY" || task.strategyKey !== BOUNTY_TASK_STRATEGY) fail("its task is not a bounty");
  const verification = task.verificationPolicy ?? fail("it has no verification policy");
  if (verification.type !== "MANUAL" || verification.strategyKey !== OWNER_APPROVAL_STRATEGY) {
    fail("its verification is not manual");
  }
  const reward = task.rewardPolicy ?? fail("it has no reward policy");
  if (reward.type !== "POINTS" || reward.strategyKey !== CAMPAIGN_POINTS_STRATEGY) fail("its reward is not points");

  const taskConfiguration = task.configuration as UnknownRecord | null;
  const rewardConfiguration = reward.configuration as UnknownRecord | null;
  const category = taskConfiguration?.category;
  if (!BOUNTY_CATEGORIES.includes(category as BountyCategory)) fail("its task has no valid category");
  const completerPoints = rewardConfiguration?.completerPoints;
  const referralPoolPoints = rewardConfiguration?.referralPoolPoints;
  if (!Number.isSafeInteger(completerPoints) || !Number.isSafeInteger(referralPoolPoints)) {
    fail("its reward has no valid point amounts");
  }

  return {
    id: row.id,
    key: row.key,
    ownerId: row.ownerId!,
    owner: { name: row.owner!.name, walletAddress: row.owner!.walletAddress },
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    status: row.status as ManualCampaignStatus,
    category: category as BountyCategory,
    completerPoints: completerPoints as number,
    referralPoolPoints: referralPoolPoints as number,
    maxCompletions: row.maxCompletions!,
    endsAt: row.endsAt!,
    isPrivate: row.isPrivate,
    privateCode: row.privateCode,
    taskId: task.id,
    rewardPolicyId: reward.id,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}
