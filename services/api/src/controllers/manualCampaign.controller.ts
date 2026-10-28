// Purpose: Serves user campaigns: creating and managing them, submitting proof, and the creator's review queue
// Notes:
// - Every route needs a login; the public board and detail reads go through campaign.controller.ts
// - A response that needs the user's wallet next carries `chain`: the contract function and arguments to send.
//   Point amounts are plain numbers; pass them to the contract as bigints
// - Block numbers are strings, since JSON has no bigint
// - Only the creator's views carry a private campaign's code; everyone else gets it from the link

import type { Request, Response } from "express";
import type { CampaignFulfillment } from "@prisma/client";
import { ManualCampaignDataError, type ManualCampaignDefinition } from "../models/manualCampaign.js";
import {
  ManualCampaignError,
  approveManualCampaignSubmission,
  changeManualCampaignStatus,
  countSpotsTaken,
  createCampaignCall,
  createManualCampaignDraft,
  decideFulfillmentCall,
  listJoinedManualCampaigns,
  listManualCampaignSubmissions,
  listOwnedManualCampaigns,
  rejectManualCampaignSubmission,
  submitFulfillmentCall,
  submitManualCampaignProof,
  updateManualCampaignDraft,
  type ManualCampaignErrorCode,
} from "../services/manualCampaign.service.js";

const ERROR_STATUS: Record<ManualCampaignErrorCode, number> = {
  INVALID_INPUT: 400,
  REWARD_ABOVE_MAXIMUM: 400,
  NOT_CAMPAIGN_OWNER: 403,
  OWN_CAMPAIGN: 403,
  CAMPAIGN_NOT_FOUND: 404,
  SUBMISSION_NOT_FOUND: 404,
  NOT_EDITABLE: 409,
  INVALID_STATUS_CHANGE: 409,
  NOT_ACCEPTING_SUBMISSIONS: 409,
  CAMPAIGN_FULL: 409,
  ALREADY_SUBMITTED: 409,
  NOT_REVIEWABLE: 409,
  CHAIN_UNAVAILABLE: 503,
};

export function handleManualCampaignError(error: unknown, res: Response, fallback: string): void {
  if (error instanceof ManualCampaignError) {
    res.status(ERROR_STATUS[error.code]).json({
      error: error.message,
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
    return;
  }
  console.error(fallback, error);
  if (error instanceof ManualCampaignDataError) {
    res.status(500).json({ error: "Campaign data is invalid" });
    return;
  }
  res.status(500).json({ error: fallback });
}

// ---------- Response shapes ----------

export function manualCampaignSummary(campaign: ManualCampaignDefinition, spotsTaken: number) {
  return {
    id: campaign.id,
    key: campaign.key,
    title: campaign.title,
    description: campaign.description,
    status: campaign.status,
    isSystem: false,
    schemaVersion: 1,
    owner: campaign.owner,
    taskType: "BOUNTY",
    category: campaign.category,
    verificationType: "MANUAL",
    reward: {
      type: "POINTS",
      completerPoints: campaign.completerPoints,
      referralPoolPoints: campaign.referralPoolPoints,
    },
    maxCompletions: campaign.maxCompletions,
    spotsLeft: Math.max(0, campaign.maxCompletions - spotsTaken),
    isPrivate: campaign.isPrivate,
    endsAt: campaign.endsAt.toISOString(),
    publishedAt: campaign.publishedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
  };
}

export function manualCampaignDetail(campaign: ManualCampaignDefinition, spotsTaken: number) {
  return { ...manualCampaignSummary(campaign, spotsTaken), instructions: campaign.instructions };
}

// The creator's view adds the private link's code, and the createCampaign call while the draft is not on chain yet
function ownerCampaign(campaign: ManualCampaignDefinition, spotsTaken: number) {
  return {
    ...manualCampaignDetail(campaign, spotsTaken),
    privateCode: campaign.privateCode,
    chain: campaign.status === "DRAFT" && !campaign.publishedAt ? createCampaignCall(campaign) : null,
  };
}

function chainEvent(transactionHash: string | null, blockNumber: bigint | null, logIndex: number | null) {
  return transactionHash
    ? { transactionHash, blockNumber: blockNumber?.toString() ?? null, logIndex }
    : null;
}

/** A submission as its participant sees it, with the submit call until the chain has it. */
export function manualFulfillmentResponse(campaign: ManualCampaignDefinition, fulfillment: CampaignFulfillment) {
  return {
    id: fulfillment.id,
    campaignId: campaign.id,
    status: fulfillment.status,
    proof: fulfillment.proof,
    rejectionReason: fulfillment.rejectionReason,
    completerReward: fulfillment.completerReward,
    createdAt: fulfillment.createdAt.toISOString(),
    submittedAt: fulfillment.submittedAt?.toISOString() ?? null,
    reviewedAt: fulfillment.reviewedAt?.toISOString() ?? null,
    verifiedAt: fulfillment.verifiedAt?.toISOString() ?? null,
    rejectedAt: fulfillment.rejectedAt?.toISOString() ?? null,
    rewardedAt: fulfillment.rewardedAt?.toISOString() ?? null,
    chainId: fulfillment.chainId,
    submission: chainEvent(
      fulfillment.submissionTransactionHash,
      fulfillment.submissionBlockNumber,
      fulfillment.submissionLogIndex,
    ),
    decision: chainEvent(
      fulfillment.verificationTransactionHash,
      fulfillment.verificationBlockNumber,
      fulfillment.verificationLogIndex,
    ),
    reward: chainEvent(fulfillment.rewardTransactionHash, fulfillment.rewardBlockNumber, fulfillment.rewardLogIndex),
    chain:
      fulfillment.status === "SUBMITTED" && !fulfillment.submissionTransactionHash
        ? submitFulfillmentCall(campaign.id, fulfillment.id)
        : null,
  };
}

type ReviewedFulfillment = CampaignFulfillment & {
  participant: { id: string; name: string | null; walletAddress: string };
};

// A submission in the creator's queue: the participant, and the decision call while it is not final on chain
function reviewItem(campaign: ManualCampaignDefinition, fulfillment: ReviewedFulfillment) {
  const undecidedOnChain = fulfillment.verifiedAt === null && fulfillment.rejectedAt === null;
  const decision =
    fulfillment.status === "APPROVED" ? "approve" : fulfillment.status === "REJECTED" ? "reject" : null;
  return {
    ...manualFulfillmentResponse(campaign, fulfillment),
    participant: fulfillment.participant,
    chain: decision && undecidedOnChain ? decideFulfillmentCall(decision, fulfillment.id) : null,
  };
}

// Express types route params as string | string[]; these routes only have plain segments
const param = (req: Request, name: string) => String(req.params[name]);

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return req.user.id;
}

async function spotsTakenFor(campaign: ManualCampaignDefinition): Promise<number> {
  return (await countSpotsTaken([campaign.taskId])).get(campaign.taskId) ?? 0;
}

// ---------- Handlers ----------

/** POST /api/campaigns - Save a new campaign as a draft */
export async function createCampaign(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const campaign = await createManualCampaignDraft(userId, req.body);
    res.status(201).json({ campaign: ownerCampaign(campaign, 0) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to create campaign");
  }
}

/** PATCH /api/campaigns/:id - Edit a draft */
export async function updateCampaign(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const campaign = await updateManualCampaignDraft(userId, param(req, "id"), req.body);
    res.json({ campaign: ownerCampaign(campaign, 0) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to update campaign");
  }
}

/** POST /api/campaigns/:id/status - Pause, resume, end or cancel */
export async function changeCampaignStatus(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const campaign = await changeManualCampaignStatus(userId, param(req, "id"), req.body?.status);
    res.json({ campaign: ownerCampaign(campaign, await spotsTakenFor(campaign)) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to change campaign status");
  }
}

/** GET /api/campaigns/mine - Campaigns you created, and the ones you submitted to */
export async function getMyCampaigns(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const [owned, joined] = await Promise.all([
      listOwnedManualCampaigns(userId),
      listJoinedManualCampaigns(userId),
    ]);
    const joinedSpots = await countSpotsTaken(joined.map(({ campaign }) => campaign.taskId));
    res.json({
      created: owned.map(({ campaign, submissions }) => {
        // Every submission except a rejected one holds a spot
        const spotsTaken = submissions.SUBMITTED + submissions.UNDER_REVIEW + submissions.APPROVED + submissions.REWARDED;
        return { ...ownerCampaign(campaign, spotsTaken), submissions };
      }),
      joined: joined.map(({ campaign, fulfillment }) => ({
        campaign: manualCampaignSummary(campaign, joinedSpots.get(campaign.taskId) ?? 0),
        fulfillment: manualFulfillmentResponse(campaign, fulfillment),
      })),
    });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to get your campaigns");
  }
}

/** POST /api/campaigns/:id/fulfillments - Submit proof */
export async function submitCampaignProof(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { campaign, fulfillment } = await submitManualCampaignProof(userId, param(req, "id"), req.body);
    res.status(201).json({ fulfillment: manualFulfillmentResponse(campaign, fulfillment) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to submit proof");
  }
}

/** GET /api/campaigns/:id/fulfillments - The creator's review queue, optionally filtered by ?status= */
export async function getCampaignSubmissions(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { campaign, fulfillments } = await listManualCampaignSubmissions(userId, param(req, "id"), req.query.status);
    res.json({ fulfillments: fulfillments.map((fulfillment) => reviewItem(campaign, fulfillment)) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to get submissions");
  }
}

/** POST /api/campaigns/:id/fulfillments/:fulfillmentId/approve */
export async function approveCampaignSubmission(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { campaign, fulfillment } = await approveManualCampaignSubmission(
      userId,
      param(req, "id"),
      param(req, "fulfillmentId"),
    );
    res.json({ fulfillment: reviewItem(campaign, fulfillment) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to approve submission");
  }
}

/** POST /api/campaigns/:id/fulfillments/:fulfillmentId/reject - Body: { reason } */
export async function rejectCampaignSubmission(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { campaign, fulfillment } = await rejectManualCampaignSubmission(
      userId,
      param(req, "id"),
      param(req, "fulfillmentId"),
      req.body,
    );
    res.json({ fulfillment: reviewItem(campaign, fulfillment) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to reject submission");
  }
}
