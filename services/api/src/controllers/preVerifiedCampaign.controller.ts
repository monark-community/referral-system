// Purpose: Serves pre-verified campaigns' winners lists: the creator's list, and each winner's claim
// Notes:
// - Every route needs a login. The winner's routes match the logged-in user's wallet against the list
// - A response that needs the user's wallet next carries `chain`, like the rest of the campaign API:
//   the creator's call that puts a listed wallet on chain, or the winner's claim
// - The creator's label for a wallet is only in the creator's view; a winner sees their own entry without it
// - Block numbers are strings, since JSON has no bigint

import type { Request, Response } from "express";
import type { CampaignWinner } from "@prisma/client";
import { getAddress } from "viem";
import type { ManualCampaignDefinition } from "../models/manualCampaign.js";
import type { DirectFundingState } from "../services/manualCampaign.service.js";
import {
  addCampaignWinners,
  claimWinnerCall,
  fundingNeeded,
  getMyCampaignWinner,
  listCampaignWinners,
  listMyPreVerifiedRewards,
  listedWinnerStateFor,
  removeCampaignWinner,
  reserveWinnerCall,
  type ClaimState,
} from "../services/preVerifiedCampaign.service.js";
import {
  chainEvent,
  handleManualCampaignError,
  manualCampaignSummary,
  param,
  requireUser,
} from "./manualCampaign.controller.js";

// ---------- Response shapes ----------

function winnerFields(campaign: ManualCampaignDefinition, winner: CampaignWinner) {
  return {
    id: winner.id,
    campaignId: campaign.id,
    walletAddress: getAddress(winner.walletAddress),
    status: winner.status,
    completerReward: campaign.rewardType === "DIRECT" ? winner.completerRewardWei : winner.completerReward,
    chainId: winner.chainId,
    createdAt: winner.createdAt.toISOString(),
    reservedAt: winner.reservedAt?.toISOString() ?? null,
    claimedAt: winner.claimedAt?.toISOString() ?? null,
    rewardedAt: winner.rewardedAt?.toISOString() ?? null,
    reservation: chainEvent(winner.reservationTransactionHash, winner.reservationBlockNumber, winner.reservationLogIndex),
    claim: chainEvent(winner.claimTransactionHash, winner.claimBlockNumber, winner.claimLogIndex),
    reward: chainEvent(winner.rewardTransactionHash, winner.rewardBlockNumber, winner.rewardLogIndex),
  };
}

/** A listed wallet as the creator sees it, with the call that puts it on chain when that is the next step. */
function listedWinner(campaign: ManualCampaignDefinition, winner: CampaignWinner, funding: DirectFundingState | null) {
  const state = listedWinnerStateFor(campaign, winner, funding);
  return {
    ...winnerFields(campaign, winner),
    label: winner.label,
    state,
    chain: state === "READY_TO_PUT_ON_CHAIN" ? reserveWinnerCall(campaign.id, winner) : null,
  };
}

/** The winner's own entry, with the claim call when they can claim. */
function myWinner(campaign: ManualCampaignDefinition, winner: CampaignWinner, state: ClaimState) {
  return {
    ...winnerFields(campaign, winner),
    state,
    chain: state === "CLAIMABLE" ? claimWinnerCall(winner.id) : null,
  };
}

function winnersList(result: Awaited<ReturnType<typeof listCampaignWinners>>) {
  const { campaign, winners, funding } = result;
  return {
    winners: winners.map((winner) => listedWinner(campaign, winner, funding)),
    funding: fundingNeeded(campaign, funding, winners),
  };
}

// ---------- Handlers ----------

/** GET /api/campaigns/:id/winners - The creator's list */
export async function getCampaignWinners(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    res.json(winnersList(await listCampaignWinners(userId, param(req, "id"))));
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to get the winners list");
  }
}

/** POST /api/campaigns/:id/winners - Add wallets. Body: { winners: [{ walletAddress, label? }] } */
export async function addWinners(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    res.status(201).json(winnersList(await addCampaignWinners(userId, param(req, "id"), req.body)));
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to add winners");
  }
}

/** DELETE /api/campaigns/:id/winners/:winnerId - Take a wallet off the list before it goes on chain */
export async function removeWinner(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    res.json(winnersList(await removeCampaignWinner(userId, param(req, "id"), param(req, "winnerId"))));
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to remove the winner");
  }
}

/** GET /api/campaigns/rewards/pre-verified/me - Every campaign that lists your wallet, with its claim */
export async function getMyPreVerifiedRewards(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const rewards = await listMyPreVerifiedRewards(userId);
    res.json({
      rewards: rewards.map(({ campaign, winner, state }) => ({
        // A pre-verified campaign takes no submissions, so none hold a spot; its spots are its listed wallets
        campaign: manualCampaignSummary(campaign, 0),
        winner: myWinner(campaign, winner, state),
      })),
    });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to get your rewards to claim");
  }
}

/** GET /api/campaigns/:id/winners/me - Your entry on one campaign's list, with its claim */
export async function getMyWinnerEntry(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { campaign, winner, state } = await getMyCampaignWinner(userId, param(req, "id"));
    res.json({ winner: myWinner(campaign, winner, state) });
  } catch (error) {
    handleManualCampaignError(error, res, "Failed to get your entry");
  }
}
