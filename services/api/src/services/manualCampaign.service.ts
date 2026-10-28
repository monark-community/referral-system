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
import { getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { prisma } from "../lib/prisma.js";
import {
  BOUNTY_TASK_STRATEGY,
  CAMPAIGN_DIRECT_NATIVE_STRATEGY,
  CAMPAIGN_POINTS_STRATEGY,
  CHAIN_REWARD_TYPE_DIRECT,
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
  directRewardPerRunWei,
  type ManualCampaignStatus,
} from "../models/manualCampaign.js";

export type ManualCampaignErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RUN_COUNT"
  | "WRONG_REWARD_TYPE"
  | "INSUFFICIENT_FUNDING"
  | "NO_DIRECT_REWARDS"
  | "INVALID_DESTINATION"
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
  getMaxCampaignDirectRewardPerCompletion(): Promise<bigint>;
  getCampaign(campaignId: Hex): Promise<{
    owner: Address;
    rewardType: number;
    status: number;
    completerReward: bigint;
    referralPool: bigint;
    balance: bigint;
  }>;
  getDirectRewardBalance(account: Address): Promise<bigint>;
};

let defaultChain: ManualCampaignChain | undefined;

function chainFromEnvironment(): ManualCampaignChain {
  if (!defaultChain) {
    const { publicClient } = createClient(process.env.CHAIN_TYPE as "localhost" | "sepolia");
    const reader = new ReadReferralContractService({ publicClient });
    defaultChain = {
      chainId: publicClient.chain!.id,
      getMaxCampaignPointsPerCompletion: () => reader.getMaxCampaignPointsPerCompletion(),
      getMaxCampaignDirectRewardPerCompletion: () => reader.getMaxCampaignDirectRewardPerCompletion(),
      getCampaign: (id) => reader.getCampaign(id),
      getDirectRewardBalance: (account) => reader.getDirectRewardBalance(account),
    };
  }
  return defaultChain;
}

const configuredChainId = () => (process.env.CHAIN_TYPE === "sepolia" ? 11155111 : 31337);
const configuredContractAddress = (): Address => {
  const value = process.env.REFERRAL_CONTRACT_ADDRESS ?? process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS
    ?? "0x5fbdb2315678afecb367f032d93f642f64180aa3";
  if (!isAddress(value)) throw new Error("Configured referral contract address is invalid");
  return getAddress(value);
};

// A contract call for the user's wallet to send; arguments are JSON-safe, so point amounts are numbers
export type ChainCall = {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  args: (string | number)[];
  valueWei?: string;
};

function chainCall(chainId: number, functionName: string, args: (string | number)[], valueWei?: string): ChainCall {
  return { chainId, contractAddress: configuredContractAddress(), functionName, args, ...(valueWei ? { valueWei } : {}) };
}

export function createCampaignCall(campaign: ManualCampaignDefinition, chainId = configuredChainId()): ChainCall {
  const direct = campaign.rewardType === "DIRECT";
  const completer = direct ? campaign.completerRewardWei : campaign.completerPoints;
  const pool = direct ? campaign.referralPoolWei : campaign.referralPoolPoints;
  return chainCall(
    chainId,
    "createCampaign",
    [
      uuidToBytes32(campaign.id),
      CHAIN_TASK_TYPE_BOUNTY,
      CHAIN_VERIFICATION_TYPE_MANUAL,
      direct ? CHAIN_REWARD_TYPE_DIRECT : CHAIN_REWARD_TYPE_POINTS,
      completer,
      pool,
    ],
    direct ? (directRewardPerRunWei(campaign) * BigInt(campaign.initialFundingRuns)).toString() : undefined,
  );
}

export function submitFulfillmentCall(campaignId: string, fulfillmentId: string, chainId = configuredChainId()): ChainCall {
  return chainCall(chainId, "submitCampaignFulfillment", [uuidToBytes32(campaignId), uuidToBytes32(fulfillmentId)]);
}

export function decideFulfillmentCall(decision: "approve" | "reject", fulfillmentId: string, chainId = configuredChainId()): ChainCall {
  return chainCall(chainId, decision === "approve" ? "verifyCampaignFulfillment" : "rejectCampaignFulfillment", [uuidToBytes32(fulfillmentId)]);
}

const campaignInclude = {
  owner: { select: { name: true, walletAddress: true } },
  task: { include: { verificationPolicy: true, rewardPolicy: true } },
} as const;

const participantSelect = { id: true, name: true, walletAddress: true } as const;

const CHAIN_STATUS_ACTIVE = 1;
const CHAIN_STATUS_PENDING_FUNDING = 3;

export type DirectFundingState = {
  balanceWei: string;
  runsRemaining: number;
  chainStatus: "ACTIVE" | "PENDING_FUNDING";
};

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

function requireDirect(campaign: ManualCampaignDefinition): asserts campaign is Extract<ManualCampaignDefinition, { rewardType: "DIRECT" }> {
  if (campaign.rewardType !== "DIRECT") {
    throw new ManualCampaignError("WRONG_REWARD_TYPE", "This operation is only available for Direct campaigns");
  }
}

async function readDirectFundingState(
  campaign: Extract<ManualCampaignDefinition, { rewardType: "DIRECT" }>,
  chain: ManualCampaignChain,
): Promise<DirectFundingState> {
  let state;
  try {
    state = await chain.getCampaign(uuidToBytes32(campaign.id));
  } catch (error) {
    console.error("Could not read Direct campaign funding", error);
    throw new ManualCampaignError("CHAIN_UNAVAILABLE", "Could not read campaign funding from the chain");
  }
  if (state.owner.toLowerCase() !== campaign.owner.walletAddress.toLowerCase() || state.rewardType !== CHAIN_REWARD_TYPE_DIRECT) {
    throw new ManualCampaignError("WRONG_REWARD_TYPE", "Stored campaign does not match the on-chain Direct campaign");
  }
  const rewardPerRun = directRewardPerRunWei(campaign);
  const runs = state.balance / rewardPerRun;
  if (runs > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ManualCampaignError("CHAIN_UNAVAILABLE", "Campaign run count exceeds the API's safe range");
  }
  const result: DirectFundingState = {
    balanceWei: state.balance.toString(),
    runsRemaining: Number(runs),
    chainStatus: state.status === CHAIN_STATUS_ACTIVE ? "ACTIVE" : "PENDING_FUNDING",
  };
  await prisma.campaign.updateMany({
    where: { id: campaign.id },
    data: { chainBalanceWei: result.balanceWei, chainStatus: result.chainStatus },
  });
  return result;
}

export async function reconcileDirectCampaignFunding(
  campaign: ManualCampaignDefinition,
  chain: ManualCampaignChain = chainFromEnvironment(),
): Promise<DirectFundingState | null> {
  if (campaign.rewardType !== "DIRECT" || !campaign.publishedAt) return null;
  return readDirectFundingState(campaign, chain);
}

export async function refreshManualCampaignFunding(
  campaign: ManualCampaignDefinition,
  chain: ManualCampaignChain = chainFromEnvironment(),
): Promise<ManualCampaignDefinition> {
  const funding = await reconcileDirectCampaignFunding(campaign, chain);
  return funding ? { ...campaign, chainBalanceWei: funding.balanceWei, chainStatus: funding.chainStatus } : campaign;
}

/** Bounded startup reconciliation for published user campaigns; individual failures are isolated. */
export async function reconcilePublishedDirectCampaigns(
  chain: ManualCampaignChain = chainFromEnvironment(),
  limit = 100,
): Promise<{ checked: number; failed: number }> {
  const rows = await prisma.campaign.findMany({
    where: { isSystem: false, ownerId: { not: null }, publishedAt: { not: null }, status: { notIn: ["ENDED", "CANCELLED"] } },
    include: campaignInclude,
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let checked = 0;
  let failed = 0;
  for (const row of rows) {
    const campaign = parseStoredManualCampaign(row);
    if (campaign.rewardType !== "DIRECT") continue;
    checked += 1;
    try {
      await reconcileDirectCampaignFunding(campaign, chain);
    } catch (error) {
      failed += 1;
      console.warn("Direct campaign funding reconciliation failed", { campaignId: campaign.id, error });
    }
  }
  return { checked, failed };
}

export async function prepareDirectCampaignFunding(
  ownerId: string,
  campaignId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  requireDirect(campaign);
  if (!campaign.publishedAt || campaign.status === "ENDED" || campaign.status === "CANCELLED") {
    throw new ManualCampaignError("NOT_ACCEPTING_SUBMISSIONS", "This campaign cannot be funded in its current state");
  }
  const runs = (body as Record<string, unknown> | null)?.runs;
  if (typeof runs !== "number" || !Number.isSafeInteger(runs) || runs < 1) {
    throw new ManualCampaignError("INVALID_RUN_COUNT", "runs must be a positive whole number", "runs");
  }
  const current = await readDirectFundingState(campaign, chain);
  const value = directRewardPerRunWei(campaign) * BigInt(runs);
  const projectedBalance = BigInt(current.balanceWei) + value;
  const projectedRuns = projectedBalance / directRewardPerRunWei(campaign);
  return {
    campaign,
    funding: {
      requestedRuns: runs,
      valueWei: value.toString(),
      currentBalanceWei: current.balanceWei,
      currentRunsRemaining: current.runsRemaining,
      projectedBalanceWei: projectedBalance.toString(),
      projectedRunsRemaining: Number(projectedRuns),
    },
    chain: chainCall(chain.chainId, "fundCampaign", [uuidToBytes32(campaign.id)], value.toString()),
  };
}

async function walletForUser(userId: string): Promise<Address> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
  if (!user || !isAddress(user.walletAddress)) {
    throw new ManualCampaignError("INVALID_DESTINATION", "The authenticated user has no valid wallet address");
  }
  return getAddress(user.walletAddress);
}

export async function getDirectRewardAccount(userId: string, chain: ManualCampaignChain = chainFromEnvironment()) {
  const wallet = await walletForUser(userId);
  let balance: bigint;
  try {
    balance = await chain.getDirectRewardBalance(wallet);
  } catch (error) {
    console.error("Could not read Direct reward balance", error);
    throw new ManualCampaignError("CHAIN_UNAVAILABLE", "Could not read Direct rewards from the chain");
  }
  const history = await prisma.directRewardEvent.findMany({
    where: { account: wallet.toLowerCase() },
    orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
    take: 100,
  });
  return { wallet, chainId: chain.chainId, balanceWei: balance.toString(), history };
}

export async function prepareDirectRewardWithdrawal(
  userId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const account = await getDirectRewardAccount(userId, chain);
  if (account.balanceWei === "0") {
    throw new ManualCampaignError("NO_DIRECT_REWARDS", "There are no Direct rewards to withdraw");
  }
  const requested = (body as Record<string, unknown> | null)?.destination;
  const destination = requested === undefined ? account.wallet : requested;
  if (typeof destination !== "string" || !isAddress(destination) || getAddress(destination) === zeroAddress) {
    throw new ManualCampaignError("INVALID_DESTINATION", "destination must be a non-zero EVM address", "destination");
  }
  return {
    wallet: account.wallet,
    destination: getAddress(destination),
    balanceWei: account.balanceWei,
    chain: chainCall(chain.chainId, "withdrawDirectRewards", [getAddress(destination)]),
  };
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
  input: ManualCampaignDefinition | ReturnType<typeof parseManualCampaignInput>,
  chain: ManualCampaignChain,
): Promise<void> {
  let maximum: bigint;
  try {
    maximum = input.rewardType === "DIRECT"
      ? await chain.getMaxCampaignDirectRewardPerCompletion()
      : await chain.getMaxCampaignPointsPerCompletion();
  } catch (error) {
    console.error("Could not read the campaign reward maximum", error);
    throw new ManualCampaignError("CHAIN_UNAVAILABLE", "Could not check the reward against the chain maximum");
  }
  const total = input.rewardType === "DIRECT"
    ? directRewardPerRunWei(input)
    : BigInt(input.completerPoints) + BigInt(input.referralPoolPoints);
  if (total > maximum) {
    const unit = input.rewardType === "DIRECT" ? "wei" : "points";
    throw new ManualCampaignError(
      "REWARD_ABOVE_MAXIMUM",
      `One completion can pay at most ${maximum} ${unit} in total; this campaign pays ${total}`,
      input.rewardType === "DIRECT" ? "completerRewardWei" : "completerPoints",
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
  await requireRewardWithinMaximum(input, chain);

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
              type: input.rewardType,
              strategyKey: input.rewardType === "DIRECT" ? CAMPAIGN_DIRECT_NATIVE_STRATEGY : CAMPAIGN_POINTS_STRATEGY,
              configuration: input.rewardType === "DIRECT"
                ? { completerRewardWei: input.completerRewardWei, referralPoolWei: input.referralPoolWei, initialFundingRuns: input.initialFundingRuns }
                : { completerPoints: input.completerPoints, referralPoolPoints: input.referralPoolPoints },
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
  await requireRewardWithinMaximum(input, chain);

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
        type: input.rewardType,
        strategyKey: input.rewardType === "DIRECT" ? CAMPAIGN_DIRECT_NATIVE_STRATEGY : CAMPAIGN_POINTS_STRATEGY,
        configuration: input.rewardType === "DIRECT"
          ? { completerRewardWei: input.completerRewardWei, referralPoolWei: input.referralPoolWei, initialFundingRuns: input.initialFundingRuns }
          : { completerPoints: input.completerPoints, referralPoolPoints: input.referralPoolPoints },
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
  if (campaign.rewardType === "DIRECT") {
    const funding = await readDirectFundingState(campaign, chain);
    if (funding.chainStatus !== "ACTIVE" || funding.runsRemaining < 1) {
      throw new ManualCampaignError("INSUFFICIENT_FUNDING", "This campaign does not have a funded run available");
    }
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
  chain?: ManualCampaignChain,
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  if (decision === "approve" && campaign.rewardType === "DIRECT") {
    const funding = await readDirectFundingState(campaign, chain ?? chainFromEnvironment());
    if (funding.chainStatus !== "ACTIVE" || funding.runsRemaining < 1) {
      throw new ManualCampaignError("INSUFFICIENT_FUNDING", "This campaign does not have a funded run available");
    }
  }
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
  chain?: ManualCampaignChain,
) {
  return decideSubmission("approve", ownerId, campaignId, fulfillmentId, undefined, now, chain);
}

export function rejectManualCampaignSubmission(
  ownerId: string,
  campaignId: string,
  fulfillmentId: string,
  body: unknown,
  now = new Date(),
  chain?: ManualCampaignChain,
) {
  return decideSubmission("reject", ownerId, campaignId, fulfillmentId, body, now, chain);
}
