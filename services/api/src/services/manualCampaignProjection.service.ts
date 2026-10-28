// Purpose: Applies the chain's user campaign events to the database
// Notes:
// - Each handler is safe to run twice for the same event, so live listening and catch-up can overlap
// - The chain is the record: an event for a campaign or submission the API doesn't know, or from the
//   wrong wallet, is skipped; a decision the chain made wins over a different one saved in the API
// - A campaign payout is stored with the sign-up payouts (source "campaign"), but never touches invite points

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

export type ProjectionResult =
  | { outcome: "APPLIED"; id: string }
  | { outcome: "ALREADY_APPLIED"; id: string }
  | { outcome: "SKIPPED"; id: string; reason: string };

const lower = (value: string) => value.toLowerCase();
const projectionChainId = () => (process.env.CHAIN_TYPE === "sepolia" ? 11155111 : 31337);

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
    include: { owner: { select: { walletAddress: true } }, task: { include: { rewardPolicy: true } } },
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

type FoundSubmission =
  | { found: true; id: string; fulfillment: NonNullable<Awaited<ReturnType<typeof findSubmission>>> }
  | { found: false; result: ProjectionResult };

// Finds the submission an event names and checks the event matches it
async function submissionFor(event: {
  campaignId: `0x${string}`;
  fulfillmentId: `0x${string}`;
  participant: string;
}): Promise<FoundSubmission> {
  const id = bytes32ToUuid(event.fulfillmentId);
  const skip = (reason: string): FoundSubmission => ({ found: false, result: { outcome: "SKIPPED", id, reason } });
  const fulfillment = await findSubmission(id);
  if (!fulfillment) return skip("not a submission the API saved");
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
  if (!found.found) return found.result;
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
  if (!found.found) return found.result;
  const { id, fulfillment } = found;
  if (fulfillment.verifiedAt) return { outcome: "ALREADY_APPLIED", id };
  if (fulfillment.status === "REJECTED") {
    console.warn("A submission rejected in the API was approved on chain; the chain's decision stands", { id });
  }

  const position = eventPosition(event);
  await prisma.campaignFulfillment.updateMany({
    where: { id, verifiedAt: null },
    data: {
      verificationTransactionHash: position.transactionHash,
      verificationBlockNumber: position.blockNumber,
      verificationLogIndex: position.logIndex,
      verifiedAt: new Date(),
      rejectionReason: null,
      ...(fulfillment.status === "REWARDED" ? {} : { status: "APPROVED" as const }),
    },
  });
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

/** CampaignRewardPaid: the completer and their referrers were paid, so the submission is REWARDED. */
export async function applyCampaignRewardPaid(
  event: CampaignRewardPaidEvent,
  chain?: CampaignProjectionChain,
): Promise<ProjectionResult> {
  const found = await submissionFor(event);
  if (!found.found) return found.result;
  const { id, fulfillment } = found;
  if (fulfillment.rewardTransactionHash) return { outcome: "ALREADY_APPLIED", id };

  const position = eventPosition(event);
  const payout = event.referralPayout;
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
      prisma.directCampaignSettlement.upsert({
        where: { chainId_transactionHash_logIndex: { chainId: projectionChainId(), transactionHash: position.transactionHash, logIndex: position.logIndex } },
        update: {},
        create: {
          fulfillmentId: id,
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
      }),
      prisma.campaign.updateMany({
        where: { id: fulfillment.task.campaignId },
        data: { chainBalanceWei: state.balance.toString(), chainStatus: state.status === 1 ? "ACTIVE" : "PENDING_FUNDING" },
      }),
    ]);
    if (fulfillment.status === "REJECTED") {
      console.warn("A submission rejected in the API was paid on chain; the chain's decision stands", { id });
    }
    return { outcome: "APPLIED", id };
  }
  const allocation = {
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
    prisma.referralPointAllocation.upsert({
      where: {
        transactionHash_logIndex: { transactionHash: allocation.transactionHash, logIndex: allocation.logIndex },
      },
      update: allocation,
      create: allocation,
    }),
  ]);
  if (fulfillment.status === "REJECTED") {
    console.warn("A submission rejected in the API was paid on chain; the chain's decision stands", { id });
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
