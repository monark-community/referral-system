// Purpose: Runs a pre-verified campaign's winners list: the creator lists wallets beforehand, puts each one on
//          chain, and each listed wallet claims its reward
// Notes:
// - Wallet-based, so a winner needs no account to be listed. They sign in with that wallet to claim, which
//   creates their account the first time
// - Like the rest of the campaign API, a step returns the contract call the user's own wallet sends, and the
//   blockchain listener confirms it (see manualCampaignProjection.service.ts)
// - The chain keeps one entry per wallet per campaign and can't remove one, so a wallet only comes off the
//   list before the creator puts it on chain, and the list always keeps at least one wallet
// - When each step is allowed:
//     add wallets    a draft, or an ACTIVE campaign before its end date
//     put on chain   once the campaign is on chain and not cancelled; a Direct one needs a funded run
//     claim          ACTIVE or ENDED, so ending a campaign never strands a listed winner; PAUSED holds claims,
//                    and a Direct one needs a funded run
// - A creator's label for a wallet is their own note: winners never see it

import { randomUUID } from "node:crypto";
import type { CampaignWinner } from "@prisma/client";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { getAddress } from "viem";
import { prisma } from "../lib/prisma.js";
import {
  MANUAL_CAMPAIGN_LIMITS,
  directRewardPerRunWei,
  parsePreVerifiedWinners,
  parseStoredManualCampaign,
  type ManualCampaignDefinition,
} from "../models/manualCampaign.js";
import {
  ManualCampaignError,
  campaignInclude,
  chainCall,
  chainFromEnvironment,
  configuredChainId,
  invalid,
  isUniqueViolation,
  readDirectFundingState,
  requireManualCampaign,
  requireOwnedCampaign,
  type ChainCall,
  type DirectFundingState,
  type ManualCampaignChain,
} from "./manualCampaign.service.js";

// ---------- Contract calls ----------

/** The creator's call that puts a listed wallet on chain, so that wallet can claim. */
export function reserveWinnerCall(
  campaignId: string,
  winner: Pick<CampaignWinner, "id" | "walletAddress">,
  chainId = configuredChainId(),
): ChainCall {
  return chainCall(chainId, "createPreVerifiedCampaignFulfillment", [
    uuidToBytes32(campaignId),
    uuidToBytes32(winner.id),
    getAddress(winner.walletAddress),
  ]);
}

/** The winner's call that claims their reward; the contract checks it comes from the listed wallet. */
export function claimWinnerCall(winnerId: string, chainId = configuredChainId()): ChainCall {
  return chainCall(chainId, "completePreVerifiedCampaignFulfillment", [uuidToBytes32(winnerId)]);
}

// ---------- Where each wallet stands ----------

// The creator's view of a listed wallet:
// - NOT_PUBLISHED: the campaign isn't on chain yet
// - READY_TO_PUT_ON_CHAIN: the creator's wallet can send the call that lists it on chain
// - WAITING_FOR_FUNDS: a Direct campaign has no funded run left, so this wallet can't go on chain or claim
// - WAITING_FOR_CLAIM: on chain, and the winner hasn't claimed yet
// - CLAIMED: the winner claimed it
// - CLOSED: the campaign was cancelled
export type ListedWinnerState =
  | "NOT_PUBLISHED"
  | "READY_TO_PUT_ON_CHAIN"
  | "WAITING_FOR_FUNDS"
  | "WAITING_FOR_CLAIM"
  | "CLAIMED"
  | "CLOSED";

// The winner's view of their own entry:
// - NOT_ON_CHAIN_YET: listed, and the creator still has to put it on chain
// - CLAIMABLE: the winner's wallet can send the claim
// - WAITING_FOR_FUNDS: a Direct campaign has no funded run left until the creator tops it up
// - PAUSED: the creator paused the campaign
// - CLAIMED: already claimed
export type ClaimState = "NOT_ON_CHAIN_YET" | "CLAIMABLE" | "WAITING_FOR_FUNDS" | "PAUSED" | "CLAIMED";

const isClaimed = (winner: Pick<CampaignWinner, "status">) =>
  winner.status === "CLAIMED" || winner.status === "REWARDED";

// A Direct campaign's chain status drops to PENDING_FUNDING once less than one run is left
const isUnfunded = (funding: DirectFundingState | null) =>
  funding !== null && (funding.chainStatus !== "ACTIVE" || funding.runsRemaining < 1);

export function listedWinnerStateFor(
  campaign: ManualCampaignDefinition,
  winner: Pick<CampaignWinner, "status">,
  funding: DirectFundingState | null,
): ListedWinnerState {
  if (isClaimed(winner)) return "CLAIMED";
  if (campaign.status === "CANCELLED") return "CLOSED";
  if (!campaign.publishedAt || campaign.status === "DRAFT") return "NOT_PUBLISHED";
  if (isUnfunded(funding)) return "WAITING_FOR_FUNDS";
  return winner.status === "LISTED" ? "READY_TO_PUT_ON_CHAIN" : "WAITING_FOR_CLAIM";
}

export function claimStateFor(
  campaign: ManualCampaignDefinition,
  winner: Pick<CampaignWinner, "status">,
  funding: DirectFundingState | null,
): ClaimState {
  if (isClaimed(winner)) return "CLAIMED";
  if (winner.status !== "RESERVED") return "NOT_ON_CHAIN_YET";
  if (campaign.status === "PAUSED") return "PAUSED";
  if (isUnfunded(funding)) return "WAITING_FOR_FUNDS";
  return "CLAIMABLE";
}

// ---------- Helpers ----------

function requirePreVerified(campaign: ManualCampaignDefinition): void {
  if (campaign.verificationType !== "PRE_VERIFIED") {
    throw new ManualCampaignError("NOT_PRE_VERIFIED", "This campaign's winners don't come from a list");
  }
}

// A published Direct campaign's funding, read from the chain; null for points or a draft
async function fundingFor(
  campaign: ManualCampaignDefinition,
  chain: ManualCampaignChain,
): Promise<DirectFundingState | null> {
  return campaign.rewardType === "DIRECT" && campaign.publishedAt ? readDirectFundingState(campaign, chain) : null;
}

async function walletOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
  if (!user) throw new ManualCampaignError("WINNER_NOT_FOUND", "You're not on this campaign's list");
  return user.walletAddress.toLowerCase();
}

const notRemoved = { status: { not: "REMOVED" as const } };

// ---------- The creator's list ----------

/** A pre-verified campaign's list for its creator, oldest first, with the campaign's Direct funding. */
export async function listCampaignWinners(
  ownerId: string,
  campaignId: string,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  requirePreVerified(campaign);
  const winners = await prisma.campaignWinner.findMany({
    where: { campaignId: campaign.id, ...notRemoved },
    orderBy: [{ createdAt: "asc" }, { walletAddress: "asc" }],
  });
  return { campaign, winners, funding: await fundingFor(campaign, chain) };
}

/** For a Direct campaign, how many more runs the creator must fund so every unpaid winner can claim. */
export function fundingNeeded(
  campaign: ManualCampaignDefinition,
  funding: DirectFundingState | null,
  winners: Pick<CampaignWinner, "status">[],
) {
  if (campaign.rewardType !== "DIRECT" || !funding) return null;
  const rewardPerRun = directRewardPerRunWei(campaign);
  const unpaidWinners = winners.filter((winner) => winner.status === "LISTED" || winner.status === "RESERVED").length;
  const runsShort = Math.max(0, unpaidWinners - funding.runsRemaining);
  return {
    balanceWei: funding.balanceWei,
    runsRemaining: funding.runsRemaining,
    chainStatus: funding.chainStatus,
    rewardPerRunWei: rewardPerRun.toString(),
    unpaidWinners,
    runsShort,
    topUpWei: (rewardPerRun * BigInt(runsShort)).toString(),
  };
}

/**
 * Adds wallets to a pre-verified campaign's list: `{ winners: [{ walletAddress, label? }] }`.
 * A wallet the creator removed earlier comes back with the same id, since it never went on chain.
 */
export async function addCampaignWinners(
  ownerId: string,
  campaignId: string,
  body: unknown,
  chain: ManualCampaignChain = chainFromEnvironment(),
  now = new Date(),
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  requirePreVerified(campaign);
  const listOpen = campaign.status === "DRAFT" || (campaign.status === "ACTIVE" && campaign.endsAt.getTime() > now.getTime());
  if (!listOpen) {
    throw new ManualCampaignError(
      "LIST_CLOSED",
      "Wallets can be added to a draft, or to an active campaign before its end date",
    );
  }
  let winners;
  try {
    winners = parsePreVerifiedWinners((body as Record<string, unknown> | null)?.winners, {
      ownerWallet: campaign.owner.walletAddress,
    });
  } catch (error) {
    invalid(error);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.campaignWinner.findMany({ where: { campaignId: campaign.id } });
      const byWallet = new Map(existing.map((winner) => [winner.walletAddress, winner]));
      winners.forEach((winner, index) => {
        const found = byWallet.get(winner.walletAddress.toLowerCase());
        if (found && found.status !== "REMOVED") {
          throw new ManualCampaignError(
            "ALREADY_LISTED",
            `${winner.walletAddress} is already on the list`,
            `winners[${index}].walletAddress`,
          );
        }
      });
      const listed = existing.filter((winner) => winner.status !== "REMOVED").length + winners.length;
      if (listed > MANUAL_CAMPAIGN_LIMITS.winners) {
        throw new ManualCampaignError(
          "INVALID_INPUT",
          `A campaign can list at most ${MANUAL_CAMPAIGN_LIMITS.winners} wallets`,
          "winners",
        );
      }
      for (const winner of winners) {
        const removed = byWallet.get(winner.walletAddress.toLowerCase());
        if (removed) {
          await tx.campaignWinner.update({ where: { id: removed.id }, data: { status: "LISTED", label: winner.label } });
        } else {
          await tx.campaignWinner.create({
            data: {
              id: randomUUID(),
              campaignId: campaign.id,
              walletAddress: winner.walletAddress.toLowerCase(),
              label: winner.label,
              chainId: chain.chainId,
            },
          });
        }
      }
      await tx.campaign.update({ where: { id: campaign.id }, data: { maxCompletions: listed } });
    });
  } catch (error) {
    // Another request can add the same wallet at the same moment
    if (isUniqueViolation(error)) {
      throw new ManualCampaignError("ALREADY_LISTED", "One of these wallets was just added to the list", "winners");
    }
    throw error;
  }
  return listCampaignWinners(ownerId, campaign.id, chain);
}

/** Takes a wallet off the list, which only works before the creator puts it on chain. */
export async function removeCampaignWinner(
  ownerId: string,
  campaignId: string,
  winnerId: string,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const campaign = await requireOwnedCampaign(ownerId, campaignId);
  requirePreVerified(campaign);
  if (campaign.status === "CANCELLED") {
    throw new ManualCampaignError("LIST_CLOSED", "A cancelled campaign's list can't change");
  }
  const winner = await prisma.campaignWinner.findFirst({ where: { id: winnerId, campaignId: campaign.id, ...notRemoved } });
  if (!winner) throw new ManualCampaignError("WINNER_NOT_FOUND", "That wallet is not on this campaign's list");
  if (winner.status !== "LISTED") {
    throw new ManualCampaignError("NOT_REMOVABLE", "This wallet is already on chain, and the contract can't take it off");
  }
  const listed = await prisma.campaignWinner.count({ where: { campaignId: campaign.id, ...notRemoved } });
  if (listed <= 1) {
    throw new ManualCampaignError("NOT_REMOVABLE", "A pre-verified campaign needs at least one wallet; add another first");
  }
  await prisma.$transaction(async (tx) => {
    // The creator's wallet may have put it on chain meanwhile; then it stays
    const { count } = await tx.campaignWinner.updateMany({
      where: { id: winner.id, status: "LISTED" },
      data: { status: "REMOVED" },
    });
    if (count === 0) {
      throw new ManualCampaignError("NOT_REMOVABLE", "This wallet just went on chain, so it can't be removed");
    }
    await tx.campaign.update({ where: { id: campaign.id }, data: { maxCompletions: listed - 1 } });
  });
  return listCampaignWinners(ownerId, campaign.id, chain);
}

// ---------- The winner's side ----------

// Claims are only offered on a published, not cancelled campaign
const claimableCampaign = { publishedAt: { not: null }, status: { in: ["ACTIVE" as const, "PAUSED" as const, "ENDED" as const] } };

/**
 * Every published pre-verified campaign that lists the user's wallet, newest first, each with its claim state.
 * Each Direct campaign's funding is read from the chain once, and only while a claim may depend on it.
 */
export async function listMyPreVerifiedRewards(
  userId: string,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const wallet = await walletOf(userId);
  const rows = await prisma.campaignWinner.findMany({
    where: { walletAddress: wallet, ...notRemoved, campaign: claimableCampaign },
    include: { campaign: { include: campaignInclude } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  const fundingByCampaign = new Map<string, DirectFundingState | null>();
  const rewards = [];
  for (const { campaign: row, ...winner } of rows) {
    const campaign = parseStoredManualCampaign(row);
    if (campaign.verificationType !== "PRE_VERIFIED") continue;
    let funding: DirectFundingState | null = null;
    if (winner.status === "RESERVED") {
      if (!fundingByCampaign.has(campaign.id)) fundingByCampaign.set(campaign.id, await fundingFor(campaign, chain));
      funding = fundingByCampaign.get(campaign.id) ?? null;
    }
    rewards.push({ campaign, winner, state: claimStateFor(campaign, winner, funding) });
  }
  return rewards;
}

/** The user's own entry on one pre-verified campaign's list, for that campaign's page. */
export async function getMyCampaignWinner(
  userId: string,
  campaignId: string,
  chain: ManualCampaignChain = chainFromEnvironment(),
) {
  const campaign = await requireManualCampaign(campaignId);
  const wallet = await walletOf(userId);
  // A manual campaign has no list to be on; answering the same way keeps a private one's details to its link
  const published = campaign.verificationType === "PRE_VERIFIED"
    && campaign.publishedAt !== null
    && ["ACTIVE", "PAUSED", "ENDED"].includes(campaign.status);
  const winner = published
    ? await prisma.campaignWinner.findFirst({ where: { campaignId: campaign.id, walletAddress: wallet, ...notRemoved } })
    : null;
  if (!winner) throw new ManualCampaignError("WINNER_NOT_FOUND", "You're not on this campaign's list");
  const funding = winner.status === "RESERVED" ? await fundingFor(campaign, chain) : null;
  return { campaign, winner, state: claimStateFor(campaign, winner, funding) };
}
