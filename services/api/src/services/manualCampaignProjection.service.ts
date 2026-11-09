// Purpose: Applies the chain's user campaign events to the database
// Notes:
// - Each handler is safe to run twice for the same event, so live listening and catch-up can overlap
// - The chain is the record: an event for a campaign or submission the API doesn't know, or from the
//   wrong wallet, is skipped; a decision the chain made wins over a different one saved in the API
// - A campaign payout is stored with the sign-up payouts (source "campaign"), but never touches invite points
// - A pre-verified campaign's listed wallets use the same three events: Submitted when the creator puts the
//   wallet on chain, Verified when the winner claims, and RewardPaid for the payout. An event whose fulfillment
//   id is not a saved submission is matched against the listed winners instead

import type {
  CampaignCreatedEvent,
  CampaignFulfillmentRejectedEvent,
  CampaignFulfillmentSubmittedEvent,
  CampaignFulfillmentVerifiedEvent,
  CampaignRewardPaidEvent,
  DirectRewardAccruedEvent,
  DirectRewardsWithdrawnEvent,
} from "@reffinity/blockchain-connector/readReferralContract";
import { bytes32ToUuid } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { prisma } from "../lib/prisma.js";
import { getApiBlockchainConfig } from "../config/blockchain.js";

export type ProjectionResult =
  | { outcome: "APPLIED"; id: string }
  | { outcome: "ALREADY_APPLIED"; id: string }
  | { outcome: "SKIPPED"; id: string; reason: string };

const lower = (value: string) => value.toLowerCase();
const projectionChainId = () => getApiBlockchainConfig().chainId;

const eventPosition = (event: { transactionHash: string; blockNumber: bigint; logIndex: number }) => ({
  transactionHash: lower(event.transactionHash),
  blockNumber: event.blockNumber,
  logIndex: event.logIndex,
});

/** CampaignCreated: the creator published their draft, so it goes ACTIVE with the reward the chain stores. */
type CampaignProjectionChain = { getCampaign(campaignId: `0x${string}`): Promise<{ balance: bigint; status: number }> };

export async function applyCampaignCreated(
  event: CampaignCreatedEvent,
  chain?: CampaignProjectionChain,
): Promise<ProjectionResult> {
  const id = bytes32ToUuid(event.campaignId);
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      owner: { select: { walletAddress: true } },
      task: { include: { rewardPolicy: true, verificationPolicy: true } },
    },
  });
  if (!campaign || campaign.isSystem || !campaign.owner || !campaign.task?.rewardPolicy) {
    return { outcome: "SKIPPED", id, reason: "not a user campaign the API created" };
  }
  if (lower(campaign.owner.walletAddress) !== lower(event.owner)) {
    return { outcome: "SKIPPED", id, reason: "created on chain by a wallet other than its owner's" };
  }
  if (campaign.publishedAt) return { outcome: "ALREADY_APPLIED", id };

  const expectedDirect = campaign.task.rewardPolicy.type === "DIRECT";
  const eventDirect = event.rewardType === 1;
  if (expectedDirect !== eventDirect) {
    return { outcome: "SKIPPED", id, reason: "chain reward type does not match the saved draft" };
  }
  // The contract's PreVerified is 2; a pre-verified draft published as manual would take proof instead
  const expectedPreVerified = campaign.task.verificationPolicy?.type === "PRE_VERIFIED";
  if (expectedPreVerified !== (event.verificationType === 2)) {
    return { outcome: "SKIPPED", id, reason: "chain verification type does not match the saved draft" };
  }

  // The chain pays what it stores, so its amounts replace the draft's if the creator edited it after sending
  const reward = eventDirect
    ? {
        completerRewardWei: event.completerReward.toString(),
        referralPoolWei: event.referralPool.toString(),
        initialFundingRuns: (campaign.task.rewardPolicy.configuration as { initialFundingRuns?: number }).initialFundingRuns,
      }
    : { completerPoints: Number(event.completerReward), referralPoolPoints: Number(event.referralPool) };
  let chainFunding: { chainBalanceWei?: string; chainStatus?: string } = {};
  if (eventDirect) {
    if (!chain) throw new Error("Direct CampaignCreated projection requires a chain reader");
    const created = await chain.getCampaign(event.campaignId);
    chainFunding = {
      chainBalanceWei: created.balance.toString(),
      chainStatus: created.status === 1 ? "ACTIVE" : "PENDING_FUNDING",
    };
  }
  await prisma.$transaction([
    prisma.campaign.updateMany({
      where: { id, publishedAt: null },
      data: {
        publishedAt: new Date(),
        publishTransactionHash: lower(event.transactionHash),
        ...chainFunding,
        // A draft cancelled before its transaction was mined stays cancelled
        ...(campaign.status === "DRAFT" ? { status: "ACTIVE" as const } : {}),
      },
    }),
    prisma.campaignRewardPolicy.update({
      where: { id: campaign.task.rewardPolicy.id },
      data: { configuration: reward },
    }),
  ]);
  return { outcome: "APPLIED", id };
}

async function findSubmission(id: string) {
  return prisma.campaignFulfillment.findUnique({
    where: { id },
    include: {
      participant: { select: { walletAddress: true } },
      task: { select: { campaignId: true, rewardPolicy: { select: { type: true } } } },
    },
  });
}

// `missing` means no submission has the event's id, so it may name a pre-verified campaign's listed winner
type FoundSubmission =
  | { found: true; id: string; fulfillment: NonNullable<Awaited<ReturnType<typeof findSubmission>>> }
  | { found: false; missing: boolean; result: ProjectionResult };

// Finds the submission an event names and checks the event matches it
async function submissionFor(event: {
  campaignId: `0x${string}`;
  fulfillmentId: `0x${string}`;
  participant: string;
}): Promise<FoundSubmission> {
  const id = bytes32ToUuid(event.fulfillmentId);
  const skip = (reason: string, missing = false): FoundSubmission => ({
    found: false,
    missing,
    result: { outcome: "SKIPPED", id, reason },
  });
  const fulfillment = await findSubmission(id);
  if (!fulfillment) return skip("not a submission the API saved", true);
  if (fulfillment.task.campaignId !== bytes32ToUuid(event.campaignId)) {
    return skip("names a different campaign than the submission's");
  }
  if (lower(fulfillment.participant.walletAddress) !== lower(event.participant)) {
    return skip("names a different participant than the submission's");
  }
  return { found: true, id, fulfillment };
}

/** CampaignFulfillmentSubmitted: the proof is on chain, so the creator can review it. */
export async function applyCampaignFulfillmentSubmitted(
  event: CampaignFulfillmentSubmittedEvent,
): Promise<ProjectionResult> {
  const found = await submissionFor(event);
  if (!found.found) return found.missing ? applyWinnerReserved(event, found.result) : found.result;
  const { id, fulfillment } = found;
  if (fulfillment.submissionTransactionHash) return { outcome: "ALREADY_APPLIED", id };

  const position = eventPosition(event);
  await prisma.campaignFulfillment.updateMany({
    where: { id, submissionTransactionHash: null },
    data: {
      submissionTransactionHash: position.transactionHash,
      submissionBlockNumber: position.blockNumber,
      submissionLogIndex: position.logIndex,
      submittedAt: new Date(),
      // A later event may have been applied first; it is never undone
      ...(fulfillment.status === "SUBMITTED" ? { status: "UNDER_REVIEW" as const } : {}),
    },
  });
  return { outcome: "APPLIED", id };
}

/** CampaignFulfillmentVerified: the creator's approval is final. The payout follows in CampaignRewardPaid. */
export async function applyCampaignFulfillmentVerified(
  event: CampaignFulfillmentVerifiedEvent,
): Promise<ProjectionResult> {
  const found = await submissionFor(event);
  if (!found.found) return found.missing ? applyWinnerClaimed(event, found.result) : found.result;
  const { id, fulfillment } = found;
  if (fulfillment.verifiedAt) return { outcome: "ALREADY_APPLIED", id };
  if (fulfillment.status === "REJECTED") {
    console.warn("A submission rejected in the API was approved on chain; the chain's decision stands", { id });
  }

  const position = eventPosition(event);
  // The payout comes from the same transaction and can be saved at any moment, so the database checks
  // the status as it writes; the copy read above may already be out of date
  await prisma.$transaction([
    prisma.campaignFulfillment.updateMany({
      where: { id, verifiedAt: null },
      data: {
        verificationTransactionHash: position.transactionHash,
        verificationBlockNumber: position.blockNumber,
        verificationLogIndex: position.logIndex,
        verifiedAt: new Date(),
        rejectionReason: null,
      },
    }),
    prisma.campaignFulfillment.updateMany({
      where: { id, status: { not: "REWARDED" } },
      data: { status: "APPROVED" },
    }),
  ]);
  return { outcome: "APPLIED", id };
}

/** CampaignFulfillmentRejected: the creator's rejection is final, and nothing is paid. */
export async function applyCampaignFulfillmentRejected(
  event: CampaignFulfillmentRejectedEvent,
): Promise<ProjectionResult> {
  const found = await submissionFor(event);
  if (!found.found) return found.result;
  const { id, fulfillment } = found;
  if (fulfillment.rejectedAt) return { outcome: "ALREADY_APPLIED", id };
  if (fulfillment.status === "APPROVED") {
    console.warn("A submission approved in the API was rejected on chain; the chain's decision stands", { id });
  }

  const position = eventPosition(event);
  await prisma.campaignFulfillment.updateMany({
    where: { id, rejectedAt: null },
    data: {
      verificationTransactionHash: position.transactionHash,
      verificationBlockNumber: position.blockNumber,
      verificationLogIndex: position.logIndex,
      rejectedAt: new Date(),
      status: "REJECTED",
    },
  });
  return { outcome: "APPLIED", id };
}

// A Direct payout's settlement row, for either a submission or a listed winner
function directSettlementUpsert(event: CampaignRewardPaidEvent, owner: { fulfillmentId: string } | { winnerId: string }) {
  const position = eventPosition(event);
  const payout = event.referralPayout;
  return prisma.directCampaignSettlement.upsert({
    where: { chainId_transactionHash_logIndex: { chainId: projectionChainId(), transactionHash: position.transactionHash, logIndex: position.logIndex } },
    update: {},
    create: {
      ...owner,
      chainId: projectionChainId(),
      transactionHash: position.transactionHash,
      logIndex: position.logIndex,
      blockNumber: position.blockNumber,
      participantWalletAddress: lower(event.participant),
      completerAmountWei: event.completerReward.toString(),
      referralPoolWei: event.referralPool.toString(),
      directRecipientWalletAddress: lower(payout.directRecipient),
      directAmountWei: payout.directAmount.toString(),
      grandparentRecipientWalletAddress: lower(payout.grandparentRecipient),
      grandparentAmountWei: payout.grandparentAmount.toString(),
      unallocatedAmountWei: payout.unallocatedAmount.toString(),
    },
  });
}

// A points payout's referral pool split, stored with the sign-up payouts
function pointAllocationUpsert(event: CampaignRewardPaidEvent) {
  const position = eventPosition(event);
  const payout = event.referralPayout;
  const allocation = {
    chainId: projectionChainId(),
    transactionHash: position.transactionHash,
    logIndex: position.logIndex,
    blockNumber: position.blockNumber,
    participantWalletAddress: lower(event.participant),
    pool: Number(event.referralPool),
    directRecipientWalletAddress: lower(payout.directRecipient),
    directAmount: Number(payout.directAmount),
    grandparentRecipientWalletAddress: lower(payout.grandparentRecipient),
    grandparentAmount: Number(payout.grandparentAmount),
    unallocatedAmount: Number(payout.unallocatedAmount),
    source: "campaign",
  };
  return prisma.referralPointAllocation.upsert({
    where: {
      chainId_transactionHash_logIndex: {
        chainId: allocation.chainId,
        transactionHash: allocation.transactionHash,
        logIndex: allocation.logIndex,
      },
    },
    update: allocation,
    create: allocation,
  });
}

// The campaign's cached Direct funding, as the chain has it after a payout. Not async, so the update
// it returns runs inside the caller's transaction
function campaignFundingUpdate(campaignId: string, state: { balance: bigint; status: number }) {
  return prisma.campaign.updateMany({
    where: { id: campaignId },
    data: { chainBalanceWei: state.balance.toString(), chainStatus: state.status === 1 ? "ACTIVE" : "PENDING_FUNDING" },
  });
}

/** CampaignRewardPaid: the completer and their referrers were paid, so the submission is REWARDED. */
export async function applyCampaignRewardPaid(
  event: CampaignRewardPaidEvent,
  chain?: CampaignProjectionChain,
): Promise<ProjectionResult> {
  const found = await submissionFor(event);
  if (!found.found) return found.missing ? applyWinnerRewarded(event, found.result, chain) : found.result;
  const { id, fulfillment } = found;
  if (fulfillment.rewardTransactionHash) return { outcome: "ALREADY_APPLIED", id };

  const position = eventPosition(event);
  const direct = fulfillment.task.rewardPolicy?.type === "DIRECT";
  if (direct !== (event.rewardType === 1)) {
    return { outcome: "SKIPPED", id, reason: "reward event type does not match the saved campaign" };
  }
  if (direct) {
    if (!chain) throw new Error("Direct CampaignRewardPaid projection requires a chain reader");
    const state = await chain.getCampaign(event.campaignId);
    await prisma.$transaction([
      prisma.campaignFulfillment.updateMany({
        where: { id, rewardTransactionHash: null },
        data: {
          rewardTransactionHash: position.transactionHash,
          rewardBlockNumber: position.blockNumber,
          rewardLogIndex: position.logIndex,
          rewardedAt: new Date(),
          completerRewardWei: event.completerReward.toString(),
          rejectionReason: null,
          status: "REWARDED",
        },
      }),
      directSettlementUpsert(event, { fulfillmentId: id }),
      campaignFundingUpdate(fulfillment.task.campaignId, state),
    ]);
    if (fulfillment.status === "REJECTED") {
      console.warn("A submission rejected in the API was paid on chain; the chain's decision stands", { id });
    }
    return { outcome: "APPLIED", id };
  }

  await prisma.$transaction([
    prisma.campaignFulfillment.updateMany({
      where: { id, rewardTransactionHash: null },
      data: {
        rewardTransactionHash: position.transactionHash,
        rewardBlockNumber: position.blockNumber,
        rewardLogIndex: position.logIndex,
        rewardedAt: new Date(),
        completerReward: Number(event.completerReward),
        rejectionReason: null,
        status: "REWARDED",
      },
    }),
    pointAllocationUpsert(event),
  ]);
  if (fulfillment.status === "REJECTED") {
    console.warn("A submission rejected in the API was paid on chain; the chain's decision stands", { id });
  }
  return { outcome: "APPLIED", id };
}

// ---------- Pre-verified campaigns' listed winners ----------

async function findWinner(id: string) {
  return prisma.campaignWinner.findUnique({
    where: { id },
    include: { campaign: { select: { task: { select: { rewardPolicy: { select: { type: true } } } } } } },
  });
}

type FoundWinner =
  | { found: true; id: string; winner: NonNullable<Awaited<ReturnType<typeof findWinner>>> }
  | { found: false; result: ProjectionResult };

// Finds the listed winner an event names and checks the event matches it. With no such winner, the
// submission lookup's result stands
async function winnerFor(
  event: { campaignId: `0x${string}`; fulfillmentId: `0x${string}`; participant: string },
  notASubmission: ProjectionResult,
): Promise<FoundWinner> {
  const id = bytes32ToUuid(event.fulfillmentId);
  const winner = await findWinner(id);
  if (!winner) return { found: false, result: notASubmission };
  const skip = (reason: string): FoundWinner => ({ found: false, result: { outcome: "SKIPPED", id, reason } });
  if (winner.campaignId !== bytes32ToUuid(event.campaignId)) return skip("names a different campaign than the listed winner's");
  if (lower(winner.walletAddress) !== lower(event.participant)) return skip("names a different wallet than the listed winner's");
  return { found: true, id, winner };
}

/** Submitted, for a listed winner: the creator put the wallet on chain, so it can claim. */
async function applyWinnerReserved(
  event: CampaignFulfillmentSubmittedEvent,
  notASubmission: ProjectionResult,
): Promise<ProjectionResult> {
  const found = await winnerFor(event, notASubmission);
  if (!found.found) return found.result;
  const { id, winner } = found;
  if (winner.reservationTransactionHash) return { outcome: "ALREADY_APPLIED", id };
  if (winner.status === "REMOVED") {
    console.warn("A wallet taken off the list was put on chain; the chain's decision stands", { id });
  }

  const position = eventPosition(event);
  await prisma.$transaction([
    prisma.campaignWinner.updateMany({
      where: { id, reservationTransactionHash: null },
      data: {
        reservationTransactionHash: position.transactionHash,
        reservationBlockNumber: position.blockNumber,
        reservationLogIndex: position.logIndex,
        reservedAt: new Date(),
      },
    }),
    // The claim may have been saved first; it is never undone
    prisma.campaignWinner.updateMany({
      where: { id, status: { in: ["LISTED", "REMOVED"] } },
      data: { status: "RESERVED" },
    }),
  ]);
  return { outcome: "APPLIED", id };
}

/** Verified, for a listed winner: the winner claimed. The payout follows in CampaignRewardPaid. */
async function applyWinnerClaimed(
  event: CampaignFulfillmentVerifiedEvent,
  notASubmission: ProjectionResult,
): Promise<ProjectionResult> {
  const found = await winnerFor(event, notASubmission);
  if (!found.found) return found.result;
  const { id, winner } = found;
  if (winner.claimTransactionHash) return { outcome: "ALREADY_APPLIED", id };

  const position = eventPosition(event);
  // The payout comes from the same transaction and can be saved at any moment, so the status is
  // checked as it is written
  await prisma.$transaction([
    prisma.campaignWinner.updateMany({
      where: { id, claimTransactionHash: null },
      data: {
        claimTransactionHash: position.transactionHash,
        claimBlockNumber: position.blockNumber,
        claimLogIndex: position.logIndex,
        claimedAt: new Date(),
      },
    }),
    prisma.campaignWinner.updateMany({
      where: { id, status: { not: "REWARDED" } },
      data: { status: "CLAIMED" },
    }),
  ]);
  return { outcome: "APPLIED", id };
}

/** RewardPaid, for a listed winner: the winner and their referrers were paid, so it is REWARDED. */
async function applyWinnerRewarded(
  event: CampaignRewardPaidEvent,
  notASubmission: ProjectionResult,
  chain?: CampaignProjectionChain,
): Promise<ProjectionResult> {
  const found = await winnerFor(event, notASubmission);
  if (!found.found) return found.result;
  const { id, winner } = found;
  if (winner.rewardTransactionHash) return { outcome: "ALREADY_APPLIED", id };

  const direct = winner.campaign.task?.rewardPolicy?.type === "DIRECT";
  if (direct !== (event.rewardType === 1)) {
    return { outcome: "SKIPPED", id, reason: "reward event type does not match the saved campaign" };
  }
  const position = eventPosition(event);
  const rewarded = prisma.campaignWinner.updateMany({
    where: { id, rewardTransactionHash: null },
    data: {
      rewardTransactionHash: position.transactionHash,
      rewardBlockNumber: position.blockNumber,
      rewardLogIndex: position.logIndex,
      rewardedAt: new Date(),
      ...(direct
        ? { completerRewardWei: event.completerReward.toString() }
        : { completerReward: Number(event.completerReward) }),
      status: "REWARDED",
    },
  });
  if (direct) {
    if (!chain) throw new Error("Direct CampaignRewardPaid projection requires a chain reader");
    const state = await chain.getCampaign(event.campaignId);
    await prisma.$transaction([
      rewarded,
      directSettlementUpsert(event, { winnerId: id }),
      campaignFundingUpdate(winner.campaignId, state),
    ]);
  } else {
    await prisma.$transaction([rewarded, pointAllocationUpsert(event)]);
  }
  return { outcome: "APPLIED", id };
}

/** DirectRewardAccrued: immutable audit history; the live balance remains chain-authoritative. */
export async function applyDirectRewardAccrued(event: DirectRewardAccruedEvent): Promise<ProjectionResult> {
  const id = `${lower(event.transactionHash)}:${event.logIndex}`;
  const existing = await prisma.directRewardEvent.findUnique({
    where: { chainId_transactionHash_logIndex: { chainId: projectionChainId(), transactionHash: lower(event.transactionHash), logIndex: event.logIndex } },
  });
  if (existing) return { outcome: "ALREADY_APPLIED", id };
  await prisma.directRewardEvent.create({
    data: {
      chainId: projectionChainId(),
      transactionHash: lower(event.transactionHash),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      type: "ACCRUED",
      account: lower(event.account),
      amountWei: event.amount.toString(),
      balanceAfterWei: event.balance.toString(),
    },
  });
  return { outcome: "APPLIED", id };
}

/** DirectRewardsWithdrawn: confirmed history only; prepared calls never write this row. */
export async function applyDirectRewardsWithdrawn(event: DirectRewardsWithdrawnEvent): Promise<ProjectionResult> {
  const id = `${lower(event.transactionHash)}:${event.logIndex}`;
  const existing = await prisma.directRewardEvent.findUnique({
    where: { chainId_transactionHash_logIndex: { chainId: projectionChainId(), transactionHash: lower(event.transactionHash), logIndex: event.logIndex } },
  });
  if (existing) return { outcome: "ALREADY_APPLIED", id };
  await prisma.directRewardEvent.create({
    data: {
      chainId: projectionChainId(),
      transactionHash: lower(event.transactionHash),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      type: "WITHDRAWN",
      account: lower(event.account),
      destination: lower(event.destination),
      amountWei: event.amount.toString(),
      balanceAfterWei: "0",
    },
  });
  return { outcome: "APPLIED", id };
}
