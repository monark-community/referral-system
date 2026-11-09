// Purpose: Tests the pre-verified winners endpoints: status codes, response shapes, and when a contract call is included
// Notes:
// - The service's database work is mocked; its state rules and contract-call builders are real, so the calls the
//   UI sends, and when it gets them, can be checked
// - Covers that a winner never sees the creator's label for their wallet, or the campaign's private code

import type { Request, Response } from "express";
import {
  addWinners,
  getCampaignWinners,
  getMyPreVerifiedRewards,
  getMyWinnerEntry,
  removeWinner,
} from "@/controllers/preVerifiedCampaign.controller.js";
import type { ManualCampaignDefinition } from "@/models/manualCampaign.js";
import { ManualCampaignError } from "@/services/manualCampaign.service.js";
import * as service from "@/services/preVerifiedCampaign.service.js";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/preVerifiedCampaign.service", () => {
  const actual = jest.requireActual("@/services/preVerifiedCampaign.service");
  return {
    ...actual,
    listCampaignWinners: jest.fn(),
    addCampaignWinners: jest.fn(),
    removeCampaignWinner: jest.fn(),
    listMyPreVerifiedRewards: jest.fn(),
    getMyCampaignWinner: jest.fn(),
  };
});
jest.mock("@reffinity/blockchain-connector/clients", () => ({ createClient: jest.fn() }), { virtual: true });
jest.mock(
  "@reffinity/blockchain-connector/readReferralContract",
  () => ({ ReadReferralContractService: jest.fn() }),
  { virtual: true },
);
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({ uuidToBytes32: (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}` }),
  { virtual: true },
);

const mocked = service as unknown as Record<string, jest.Mock>;
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const WINNER_ID = "44444444-4444-4444-8444-444444444444";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const bytes32 = (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}`;

function campaign(overrides: Partial<ManualCampaignDefinition> = {}): ManualCampaignDefinition {
  return {
    id: CAMPAIGN_ID,
    key: CAMPAIGN_ID,
    title: "Photo contest",
    description: "",
    instructions: "The best photo wins",
    category: "COMMUNITY",
    maxCompletions: 1,
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    isPrivate: true,
    privateCode: "secret-code",
    verificationType: "PRE_VERIFIED",
    ownerId: "owner",
    owner: { name: "Owner", walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" },
    status: "ACTIVE",
    taskId: "task-1",
    rewardPolicyId: "reward-1",
    publishedAt: new Date("2026-10-17T00:00:00.000Z"),
    chainStatus: null,
    chainBalanceWei: null,
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    rewardType: "POINTS",
    completerPoints: 30,
    referralPoolPoints: 10,
    ...overrides,
  } as ManualCampaignDefinition;
}

function winner(overrides: Record<string, unknown> = {}) {
  return {
    id: WINNER_ID,
    campaignId: CAMPAIGN_ID,
    walletAddress: ALICE.toLowerCase(),
    label: "First place",
    status: "LISTED",
    chainId: 31337,
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    updatedAt: new Date("2026-10-16T00:00:00.000Z"),
    reservationTransactionHash: null,
    reservationBlockNumber: null,
    reservationLogIndex: null,
    reservedAt: null,
    claimTransactionHash: null,
    claimBlockNumber: null,
    claimLogIndex: null,
    claimedAt: null,
    rewardTransactionHash: null,
    rewardBlockNumber: null,
    rewardLogIndex: null,
    rewardedAt: null,
    completerReward: null,
    completerRewardWei: null,
    ...overrides,
  };
}

function request(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: "owner" },
    params: { id: CAMPAIGN_ID, winnerId: WINNER_ID },
    body: {},
    ...overrides,
  } as unknown as Request;
}

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

const body = (res: { json: jest.Mock }) => res.json.mock.calls[0][0];

beforeEach(() => {
  jest.resetAllMocks();
});

describe("the creator's list", () => {
  test("shows each wallet checksummed with its label, and the call that puts a listed wallet on chain", async () => {
    mocked.listCampaignWinners.mockResolvedValue({ campaign: campaign(), winners: [winner()], funding: null });
    const res = response();
    await getCampaignWinners(request(), res);

    expect(body(res)).toEqual({
      winners: [
        expect.objectContaining({
          id: WINNER_ID,
          walletAddress: ALICE,
          label: "First place",
          status: "LISTED",
          state: "READY_TO_PUT_ON_CHAIN",
          reservation: null,
          chain: expect.objectContaining({
            functionName: "createPreVerifiedCampaignFulfillment",
            args: [bytes32(CAMPAIGN_ID), bytes32(WINNER_ID), ALICE],
          }),
        }),
      ],
      funding: null,
    });
  });

  test("a wallet already on chain carries its event and no call", async () => {
    mocked.listCampaignWinners.mockResolvedValue({
      campaign: campaign(),
      winners: [winner({ status: "RESERVED", reservationTransactionHash: "0xreserved", reservationBlockNumber: 11n, reservationLogIndex: 2 })],
      funding: null,
    });
    const res = response();
    await getCampaignWinners(request(), res);

    expect(body(res).winners[0]).toEqual(expect.objectContaining({
      state: "WAITING_FOR_CLAIM",
      reservation: { transactionHash: "0xreserved", blockNumber: "11", logIndex: 2 },
      chain: null,
    }));
  });

  test("a Direct campaign says how much to top up so every unpaid winner can claim", async () => {
    const direct = campaign({ rewardType: "DIRECT", completerRewardWei: "300", referralPoolWei: "100", initialFundingRuns: 1 } as never);
    mocked.listCampaignWinners.mockResolvedValue({
      campaign: direct,
      winners: [winner({ status: "RESERVED" }), winner({ id: "w-2", status: "LISTED" })],
      funding: { balanceWei: "0", runsRemaining: 0, chainStatus: "PENDING_FUNDING" },
    });
    const res = response();
    await getCampaignWinners(request(), res);

    expect(body(res).funding).toEqual(expect.objectContaining({ unpaidWinners: 2, runsShort: 2, topUpWei: "800" }));
    expect(body(res).winners.map((entry: { state: string }) => entry.state)).toEqual(["WAITING_FOR_FUNDS", "WAITING_FOR_FUNDS"]);
  });

  test("adding wallets answers 201 with the new list", async () => {
    mocked.addCampaignWinners.mockResolvedValue({ campaign: campaign(), winners: [winner()], funding: null });
    const res = response();
    await addWinners(request({ body: { winners: [{ walletAddress: ALICE }] } }), res);

    expect(mocked.addCampaignWinners).toHaveBeenCalledWith("owner", CAMPAIGN_ID, { winners: [{ walletAddress: ALICE }] });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test.each([
    ["ALREADY_LISTED", 409],
    ["LIST_CLOSED", 409],
    ["NOT_PRE_VERIFIED", 409],
    ["NOT_CAMPAIGN_OWNER", 403],
  ])("%s answers %i", async (code, status) => {
    mocked.addCampaignWinners.mockRejectedValue(new ManualCampaignError(code as never, "nope", "winners"));
    const res = response();
    await addWinners(request(), res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(body(res)).toEqual({ error: "nope", code, field: "winners" });
  });

  test("removing a wallet already on chain answers 409", async () => {
    mocked.removeCampaignWinner.mockRejectedValue(new ManualCampaignError("NOT_REMOVABLE", "on chain"));
    const res = response();
    await removeWinner(request(), res);
    expect(mocked.removeCampaignWinner).toHaveBeenCalledWith("owner", CAMPAIGN_ID, WINNER_ID);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("needs a login", async () => {
    const res = response();
    await getCampaignWinners(request({ user: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.listCampaignWinners).not.toHaveBeenCalled();
  });
});

describe("the winner's side", () => {
  test("lists rewards to claim without the creator's label or the campaign's private code", async () => {
    mocked.listMyPreVerifiedRewards.mockResolvedValue([
      { campaign: campaign(), winner: winner({ status: "RESERVED" }), state: "CLAIMABLE" },
    ]);
    const res = response();
    await getMyPreVerifiedRewards(request({ user: { id: "alice" } } as never), res);

    const [reward] = body(res).rewards;
    expect(reward.campaign).toEqual(expect.objectContaining({ id: CAMPAIGN_ID, verificationType: "PRE_VERIFIED", isPrivate: true }));
    expect(reward.campaign).not.toHaveProperty("privateCode");
    expect(reward.winner).not.toHaveProperty("label");
    expect(reward.winner).toEqual(expect.objectContaining({
      state: "CLAIMABLE",
      chain: expect.objectContaining({ functionName: "completePreVerifiedCampaignFulfillment", args: [bytes32(WINNER_ID)] }),
    }));
  });

  test.each(["NOT_ON_CHAIN_YET", "WAITING_FOR_FUNDS", "PAUSED", "CLAIMED"])("%s carries no claim call", async (state) => {
    mocked.getMyCampaignWinner.mockResolvedValue({ campaign: campaign(), winner: winner({ status: "RESERVED" }), state });
    const res = response();
    await getMyWinnerEntry(request({ user: { id: "alice" } } as never), res);
    expect(body(res).winner).toEqual(expect.objectContaining({ state, chain: null }));
  });

  test("someone not on the list gets 404", async () => {
    mocked.getMyCampaignWinner.mockRejectedValue(new ManualCampaignError("WINNER_NOT_FOUND", "not listed"));
    const res = response();
    await getMyWinnerEntry(request({ user: { id: "bob" } } as never), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(body(res)).toEqual({ error: "not listed", code: "WINNER_NOT_FOUND" });
  });
});
