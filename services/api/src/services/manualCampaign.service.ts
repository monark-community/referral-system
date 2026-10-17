// Purpose: Creates, edits and reviews user campaigns, and takes participants' proof
// Notes:
// - The API saves each step first and returns the contract call the user's own wallet then sends;
//   the blockchain listener confirms it (see manualCampaignProjection.service.ts)
// - A draft becomes ACTIVE only when the chain has it, and only a draft can be edited
// - Each user submits once per campaign, a rejection frees the spot but not the user's one try,
//   and creators can't take part in their own campaigns
// - Pause, end and cancel are kept here; the contract has no such states, so the API stops taking submissions

import { randomUUID } from "node:crypto";
import { Prisma, type CampaignFulfillmentStatus } from "@prisma/client";
import { createClient } from "@reffinity/blockchain-connector/clients";
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { prisma } from "../lib/prisma.js";
import {
  BOUNTY_TASK_STRATEGY,
  CAMPAIGN_POINTS_STRATEGY,
  CHAIN_REWARD_TYPE_POINTS,
  CHAIN_TASK_TYPE_BOUNTY,
  CHAIN_VERIFICATION_TYPE_MANUAL,
  ManualCampaignValidationError,
  OWNER_APPROVAL_STRATEGY,
  parseManualCampaignInput,
  parseProof,
  parseRejectionReason,
  parseStoredManualCampaign,
  type ManualCampaignDefinition,
  type ManualCampaignStatus,
} from "../models/manualCampaign.js";

export type ManualCampaignErrorCode =
  | "INVALID_INPUT"
  | "REWARD_ABOVE_MAXIMUM"
  | "CAMPAIGN_NOT_FOUND"
  | "SUBMISSION_NOT_FOUND"
  | "NOT_CAMPAIGN_OWNER"
  | "OWN_CAMPAIGN"
  | "NOT_EDITABLE"
  | "INVALID_STATUS_CHANGE"
  | "NOT_ACCEPTING_SUBMISSIONS"
  | "CAMPAIGN_FULL"
  | "ALREADY_SUBMITTED"
  | "NOT_REVIEWABLE"
  | "CHAIN_UNAVAILABLE";

export class ManualCampaignError extends Error {
  constructor(
    public readonly code: ManualCampaignErrorCode,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ManualCampaignError";
  }
}

// What the service needs from the chain, so tests can pass their own
export type ManualCampaignChain = {
  chainId: number;
  getMaxCampaignPointsPerCompletion(): Promise<bigint>;
};

let defaultChain: ManualCampaignChain | undefined;

function chainFromEnvironment(): ManualCampaignChain {
  if (!defaultChain) {
    const { publicClient } = createClient(process.env.CHAIN_TYPE as "localhost" | "sepolia");
    const reader = new ReadReferralContractService({ publicClient });
    defaultChain = {
      chainId: publicClient.chain!.id,
      getMaxCampaignPointsPerCompletion: () => reader.getMaxCampaignPointsPerCompletion(),
    };
  }
  return defaultChain;
}

// A contract call for the user's wallet to send; arguments are JSON-safe, so point amounts are numbers
export type ChainCall = { functionName: string; args: (string | number)[] };

export function createCampaignCall(campaign: ManualCampaignDefinition): ChainCall {
  return {
    functionName: "createCampaign",
    args: [
      uuidToBytes32(campaign.id),
      CHAIN_TASK_TYPE_BOUNTY,
      CHAIN_VERIFICATION_TYPE_MANUAL,
      CHAIN_REWARD_TYPE_POINTS,
      campaign.completerPoints,
      campaign.referralPoolPoints,
    ],
  };
}

export function submitFulfillmentCall(campaignId: string, fulfillmentId: string): ChainCall {
  return {
    functionName: "submitCampaignFulfillment",
    args: [uuidToBytes32(campaignId), uuidToBytes32(fulfillmentId)],
  };
}

export function decideFulfillmentCall(decision: "approve" | "reject", fulfillmentId: string): ChainCall {
  return {
    functionName: decision === "approve" ? "verifyCampaignFulfillment" : "rejectCampaignFulfillment",
    args: [uuidToBytes32(fulfillmentId)],
  };
}

const campaignInclude = {
  owner: { select: { name: true, walletAddress: true } },
  task: { include: { verificationPolicy: true, rewardPolicy: true } },
} as const;

const participantSelect = { id: true, name: true, walletAddress: true } as const;

function invalid(error: unknown): never {
  if (error instanceof ManualCampaignValidationError) {
    throw new ManualCampaignError("INVALID_INPUT", error.message, error.field);
  }
  throw error;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ---------- Reading campaigns ----------

/** A user campaign by id or key, or null if there is none (the built-in referral campaign is not one). */
export async function findManualCampaign(idOrKey: string): Promise<ManualCampaignDefinition | null> {
  const row = await prisma.campaign.findFirst({
    where: { OR: [{ id: idOrKey }, { key: idOrKey }], isSystem: false, ownerId: { not: null } },
    include: campaignInclude,
  });
  return row ? parseStoredManualCampaign(row) : null;
}

async function requireManualCampaign(campaignId: string): Promise<ManualCampaignDefinition> {
  const campaign = await findManualCampaign(campaignId);
  if (!campaign) throw new ManualCampaignError("CAMPAIGN_NOT_FOUND", "Campaign not found");
  return campaign;
}

async function requireOwnedCampaign(ownerId: string, campaignId: string): Promise<ManualCampaignDefinition> {
  const campaign = await requireManualCampaign(campaignId);
  if (campaign.ownerId !== ownerId) {
    throw new ManualCampaignError("NOT_CAMPAIGN_OWNER", "Only the campaign's creator can do this");
  }
  return campaign;
}

/** Submissions that hold a spot: everything except rejected ones, per task. */
export async function countSpotsTaken(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const groups = await prisma.campaignFulfillment.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds }, status: { not: "REJECTED" } },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.taskId, group._count._all]));
}

/** Campaigns taking submissions now, for the campaign board, newest first. */
export async function listOpenManualCampaigns(now = new Date()): Promise<ManualCampaignDefinition[]> {
  const rows = await prisma.campaign.findMany({
    where: { isSystem: false, ownerId: { not: null }, status: "ACTIVE", endsAt: { gt: now } },
    include: campaignInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(parseStoredManualCampaign);
}

export type SubmissionCounts = Record<"SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "REWARDED", number>;

/** The campaigns a user created, in any state, with how many submissions are in each state. */
export async function listOwnedManualCampaigns(
  ownerId: string,
): Promise<{ campaign: ManualCampaignDefinition; submissions: SubmissionCounts }[]> {
  const rows = await prisma.campaign.findMany({
    where: { ownerId, isSystem: false },
    include: campaignInclude,
    orderBy: { createdAt: "desc" },
  });
  const campaigns = rows.map(parseStoredManualCampaign);
  const groups = campaigns.length
    ? await prisma.campaignFulfillment.groupBy({
        by: ["taskId", "status"],
        where: { taskId: { in: campaigns.map((campaign) => campaign.taskId) } },
        _count: { _all: true },
      })
    : [];

  return campaigns.map((campaign) => {
    const submissions: SubmissionCounts = { SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, REWARDED: 0 };
    for (const group of groups) {
      if (group.taskId === campaign.taskId && group.status in submissions) {
        submissions[group.status as keyof SubmissionCounts] = group._count._all;
      }
    }
    return { campaign, submissions };
  });
}

/** The user's submissions to other people's campaigns, newest first. */
export async function listJoinedManualCampaigns(userId: string) {
  const rows = await prisma.campaignFulfillment.findMany({
    where: { participantId: userId, task: { campaign: { isSystem: false, ownerId: { not: null } } } },
    include: { task: { include: { campaign: { include: campaignInclude } } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ task, ...fulfillment }) => ({
    fulfillment,
    campaign: parseStoredManualCampaign(task.campaign),
  }));
}

// ---------- Creating and managing campaigns ----------

async function requireRewardWithinMaximum(
  completerPoints: number,
  referralPoolPoints: number,
  chain: ManualCampaignChain,
): Promise<void> {
  let maximum: bigint;
  try {
    maximum = await chain.getMaxCampaignPointsPerCompletion();
  } catch (error) {
    console.error("Could not read the campaign points maximum", error);
    throw new ManualCampaignError("CHAIN_UNAVAILABLE", "Could not check the reward against the points maximum");
  }
  const total = BigInt(completerPoints) + BigInt(referralPoolPoints);
  if (total > maximum) {
    throw new ManualCampaignError(
      "REWARD_ABOVE_MAXIMUM",
      `One completion can pay at most ${maximum} points in total; this campaign pays ${total}`,
      "completerPoints",
    );
  }
}

/** Saves a new campaign as a DRAFT owned by the user. */
export async function createManualCampaignDraft(
  ownerId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
  now = new Date(),
): Promise<ManualCampaignDefinition> {
  let input;
  try {
    input = parseManualCampaignInput(body, { now });
  } catch (error) {
    invalid(error);
  }
  await requireRewardWithinMaximum(input.completerPoints, input.referralPoolPoints, chain);

  // The id doubles as the key, and as the on-chain campaign id once converted to bytes32
  const id = randomUUID();
  const row = await prisma.campaign.create({
    data: {
      id,
      key: id,
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      isSystem: false,
      status: "DRAFT",
      ownerId,
      maxCompletions: input.maxCompletions,
      endsAt: input.endsAt,
      task: {
        create: {
          type: "BOUNTY",
          strategyKey: BOUNTY_TASK_STRATEGY,
          configuration: { category: input.category },
          verificationPolicy: {
            create: { type: "MANUAL", strategyKey: OWNER_APPROVAL_STRATEGY, configuration: {} },
          },
          rewardPolicy: {
            create: {
              type: "POINTS",
              strategyKey: CAMPAIGN_POINTS_STRATEGY,
              configuration: {
                completerPoints: input.completerPoints,
                referralPoolPoints: input.referralPoolPoints,
              },
            },
          },
        },
      },
    },
    include: campaignInclude,
  });
  return parseStoredManualCampaign(row);
}

/** Changes a DRAFT; fields left out keep their value. */
export async function updateManualCampaignDraft(
  ownerId: string,
  campaignId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
  now = new Date(),
): Promise<ManualCampaignDefinition> {
  const current = await requireOwnedCampaign(ownerId, campaignId);
  if (current.status !== "DRAFT") {
    throw new ManualCampaignError("NOT_EDITABLE", "Only a draft can be edited");
  }
  let input;
  try {
    input = parseManualCampaignInput(body, { now, current });
  } catch (error) {
    invalid(error);
  }
  await requireRewardWithinMaximum(input.completerPoints, input.referralPoolPoints, chain);

  await prisma.$transaction(async (tx) => {
    // The listener may publish the campaign meanwhile; then the edit must not go through
    const { count } = await tx.campaign.updateMany({
      where: { id: current.id, status: "DRAFT" },
      data: {
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        maxCompletions: input.maxCompletions,
        endsAt: input.endsAt,
      },
    });
    if (count === 0) throw new ManualCampaignError("NOT_EDITABLE", "Only a draft can be edited");
    await tx.campaignTask.update({
      where: { id: current.taskId },
      data: { configuration: { category: input.category } },
    });
    await tx.campaignRewardPolicy.update({
      where: { id: current.rewardPolicyId },
      data: {
        configuration: {
          completerPoints: input.completerPoints,
          referralPoolPoints: input.referralPoolPoints,
        },
      },
    });
  });
  return requireManualCampaign(current.id);
}

// DRAFT becomes ACTIVE only through the chain, so it is not a target here
const STATUS_CHANGES: Record<ManualCampaignStatus, ManualCampaignStatus[]> = {
  DRAFT: ["CANCELLED"],
  ACTIVE: ["PAUSED", "ENDED", "CANCELLED"],
  PAUSED: ["ACTIVE", "ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

/** Pauses, resumes, ends or cancels a campaign. */
export async function changeManualCampaignStatus(
  ownerId: string,
  campaignId: string,
  status: unknown,
): Promise<ManualCampaignDefinition> {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  const allowed = STATUS_CHANGES[campaign.status];
  if (typeof status !== "string" || !allowed.includes(status as ManualCampaignStatus)) {
    throw new ManualCampaignError(
      "INVALID_STATUS_CHANGE",
      allowed.length
        ? `A ${campaign.status} campaign can only become ${allowed.join(", ")}`
        : `A ${campaign.status} campaign can't change state`,
      "status",
    );
  }
  const { count } = await prisma.campaign.updateMany({
    where: { id: campaign.id, status: campaign.status },
    data: { status: status as ManualCampaignStatus },
  });
  if (count === 0) {
    throw new ManualCampaignError("INVALID_STATUS_CHANGE", "The campaign changed state meanwhile; try again");
  }
  return requireManualCampaign(campaign.id);
}

// ---------- Submissions ----------

export async function getMyManualCampaignFulfillment(userId: string, campaign: ManualCampaignDefinition) {
  return prisma.campaignFulfillment.findFirst({
    where: { taskId: campaign.taskId, participantId: userId },
  });
}

/** Saves a participant's proof as SUBMITTED; their wallet then sends it to the chain. */
export async function submitManualCampaignProof(
  userId: string,
  campaignId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
  now = new Date(),
) {
  const campaign = await requireManualCampaign(campaignId);
  if (campaign.ownerId === userId) {
    throw new ManualCampaignError("OWN_CAMPAIGN", "Creators can't complete their own campaigns");
  }
  if (campaign.status !== "ACTIVE" || campaign.endsAt.getTime() <= now.getTime()) {
    throw new ManualCampaignError("NOT_ACCEPTING_SUBMISSIONS", "This campaign is not taking submissions");
  }
  if (await getMyManualCampaignFulfillment(userId, campaign)) {
    throw new ManualCampaignError("ALREADY_SUBMITTED", "You have already submitted to this campaign");
  }
  const taken = (await countSpotsTaken([campaign.taskId])).get(campaign.taskId) ?? 0;
  if (taken >= campaign.maxCompletions) {
    throw new ManualCampaignError("CAMPAIGN_FULL", "This campaign has no spots left");
  }

  let proof;
  try {
    proof = parseProof(campaign.category, (body as Record<string, unknown> | null)?.proof);
  } catch (error) {
    invalid(error);
  }

  try {
    const fulfillment = await prisma.campaignFulfillment.create({
      data: {
        id: randomUUID(),
        taskId: campaign.taskId,
        participantId: userId,
        attempt: 1,
        idempotencyKey: `manual:${campaign.taskId}:${userId}`,
        status: "SUBMITTED",
        chainId: chain.chainId,
        proof,
      },
    });
    return { campaign, fulfillment };
  } catch (error) {
    // A second request from the same user can get past the check above at the same moment
    if (isUniqueViolation(error)) {
      throw new ManualCampaignError("ALREADY_SUBMITTED", "You have already submitted to this campaign");
    }
    throw error;
  }
}

/** The creator's review queue: every submission with its proof and participant, oldest first. */
export async function listManualCampaignSubmissions(ownerId: string, campaignId: string, status?: unknown) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  const statuses = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "REWARDED"];
  if (status !== undefined && (typeof status !== "string" || !statuses.includes(status))) {
    throw new ManualCampaignError("INVALID_INPUT", `status must be one of ${statuses.join(", ")}`, "status");
  }
  const fulfillments = await prisma.campaignFulfillment.findMany({
    where: {
      taskId: campaign.taskId,
      ...(status ? { status: status as CampaignFulfillmentStatus } : {}),
    },
    include: { participant: { select: participantSelect } },
    orderBy: { createdAt: "asc" },
  });
  return { campaign, fulfillments };
}

/**
 * Records the creator's decision; their wallet then sends it to the chain, which makes it final.
 * Until the chain confirms one, the creator can change their mind or resend the transaction.
 */
async function decideSubmission(
  decision: "approve" | "reject",
  ownerId: string,
  campaignId: string,
  fulfillmentId: string,
  body: unknown,
  now: Date,
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  const fulfillment = await prisma.campaignFulfillment.findFirst({
    where: { id: fulfillmentId, taskId: campaign.taskId },
  });
  if (!fulfillment) throw new ManualCampaignError("SUBMISSION_NOT_FOUND", "Submission not found");

  const decidedOnChain = fulfillment.verifiedAt !== null || fulfillment.rejectedAt !== null;
  const reviewable = ["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(fulfillment.status);
  if (!reviewable || decidedOnChain) {
    throw new ManualCampaignError(
      "NOT_REVIEWABLE",
      fulfillment.status === "SUBMITTED"
        ? "This submission is not on chain yet, so it can't be reviewed"
        : "This submission has already been decided",
    );
  }

  let rejectionReason: string | null = null;
  if (decision === "reject") {
    try {
      rejectionReason = parseRejectionReason((body as Record<string, unknown> | null)?.reason);
    } catch (error) {
      invalid(error);
    }
  }

  const { count } = await prisma.campaignFulfillment.updateMany({
    // Unchanged since it was read, and still undecided on chain
    where: { id: fulfillment.id, status: fulfillment.status, verifiedAt: null, rejectedAt: null },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      rejectionReason,
      reviewedAt: now,
    },
  });
  if (count === 0) {
    throw new ManualCampaignError("NOT_REVIEWABLE", "The submission changed meanwhile; reload it and try again");
  }
  const updated = await prisma.campaignFulfillment.findUniqueOrThrow({
    where: { id: fulfillment.id },
    include: { participant: { select: participantSelect } },
  });
  return { campaign, fulfillment: updated };
}

export function approveManualCampaignSubmission(
  ownerId: string,
  campaignId: string,
  fulfillmentId: string,
  now = new Date(),
) {
  return decideSubmission("approve", ownerId, campaignId, fulfillmentId, undefined, now);
}

export function rejectManualCampaignSubmission(
  ownerId: string,
  campaignId: string,
  fulfillmentId: string,
  body: unknown,
  now = new Date(),
) {
  return decideSubmission("reject", ownerId, campaignId, fulfillmentId, body, now);
}
