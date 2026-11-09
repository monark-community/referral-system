// Purpose: Tests pre-verified campaigns: drafts with a winners list, the creator's list after publishing,
//          and each listed wallet's claim
// Notes:
// - Prisma is mocked; each test sets up the rows it needs, and a transaction runs on the same mock
// - The chain is a stand-in passed to each call, so a Direct campaign's funding is under the test's control
// - Wallets are Hardhat's test wallets: #0 creates the campaign, #1 and #2 are listed winners

import { prisma } from "@/lib/prisma.js";
import {
  ManualCampaignError,
  createCampaignCall,
  createManualCampaignDraft,
  prepareDirectCampaignFunding,
  submitManualCampaignProof,
  updateManualCampaignDraft,
  type ManualCampaignChain,
} from "@/services/manualCampaign.service.js";
import {
  addCampaignWinners,
  claimStateFor,
  claimWinnerCall,
  fundingNeeded,
  getMyCampaignWinner,
  listCampaignWinners,
  listMyPreVerifiedRewards,
  listedWinnerStateFor,
  removeCampaignWinner,
  reserveWinnerCall,
} from "@/services/preVerifiedCampaign.service.js";
import { parseStoredManualCampaign } from "@/models/manualCampaign.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    campaignTask: { update: jest.fn() },
    campaignRewardPolicy: { update: jest.fn() },
    campaignVerificationPolicy: { update: jest.fn() },
    campaignWinner: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    campaignFulfillment: { findFirst: jest.fn(), groupBy: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@reffinity/blockchain-connector/clients", () => ({ createClient: jest.fn() }), { virtual: true });
jest.mock(
  "@reffinity/blockchain-connector/readReferralContract",
  () => ({ ReadReferralContractService: jest.fn() }),
  { virtual: true },
);
// The real conversion, so the on-chain ids in contract calls can be checked
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({ uuidToBytes32: (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}` }),
  { virtual: true },
);

const db = prisma as any;
const now = new Date("2026-10-17T12:00:00.000Z");
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const WINNER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_WINNER_ID = "55555555-5555-4555-8555-555555555555";
const bytes32 = (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}`;

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

function chain(balance = 800n, status = 1): ManualCampaignChain & { getCampaign: jest.Mock } {
  return {
    chainId: 31337,
    getMaxCampaignPointsPerCompletion: jest.fn().mockResolvedValue(1000n),
    getMaxCampaignDirectRewardPerCompletion: jest.fn().mockResolvedValue(10n ** 30n),
    getCampaign: jest.fn().mockResolvedValue({
      owner: OWNER,
      rewardType: 1,
      status,
      completerReward: 300n,
      referralPool: 100n,
      balance,
    }),
    getDirectRewardBalance: jest.fn(),
  };
}

// A private pre-verified campaign row as Prisma returns it with the service's includes
function storedCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    key: CAMPAIGN_ID,
    title: "Photo contest",
    description: "",
    instructions: "The best photo wins",
    isSystem: false,
    status: "ACTIVE",
    ownerId: "owner",
    owner: { name: "Owner", walletAddress: OWNER.toLowerCase() },
    maxCompletions: 2,
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    isPrivate: true,
    privateCode: "secret-code",
    publishedAt: new Date("2026-10-17T00:00:00.000Z"),
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    task: {
      id: "task-1",
      type: "BOUNTY",
      strategyKey: "BOUNTY_V1",
      configuration: { category: "COMMUNITY" },
      verificationPolicy: { id: "verification-1", type: "PRE_VERIFIED", strategyKey: "CREATOR_WINNER_LIST_V1" },
      rewardPolicy: {
        id: "reward-1",
        type: "POINTS",
        strategyKey: "CAMPAIGN_POINTS_V1",
        configuration: { completerPoints: 30, referralPoolPoints: 10 },
      },
    },
    ...overrides,
  };
}

function storedDirectCampaign(overrides: Record<string, unknown> = {}) {
  const base = storedCampaign();
  return {
    ...base,
    task: {
      ...base.task,
      rewardPolicy: {
        id: "reward-1",
        type: "DIRECT",
        strategyKey: "CAMPAIGN_DIRECT_NATIVE_V1",
        configuration: { completerRewardWei: "300", referralPoolWei: "100", initialFundingRuns: 1 },
      },
    },
    ...overrides,
  };
}

function storedManualCampaign(overrides: Record<string, unknown> = {}) {
  const base = storedCampaign();
  return {
    ...base,
    task: { ...base.task, verificationPolicy: { id: "verification-1", type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" } },
    ...overrides,
  };
}

function storedWinner(overrides: Record<string, unknown> = {}) {
  return {
    id: WINNER_ID,
    campaignId: CAMPAIGN_ID,
    walletAddress: ALICE.toLowerCase(),
    label: "Contest winner",
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

const draftBody = {
  title: "Photo contest",
  instructions: "The best photo wins",
  category: "COMMUNITY",
  completerPoints: 30,
  referralPoolPoints: 10,
  endsAt: "2026-11-01T00:00:00.000Z",
  isPrivate: true,
  verificationType: "PRE_VERIFIED",
  winners: [{ walletAddress: ALICE, label: "First place" }, { walletAddress: BOB }],
};

// The error code, and field if any, a call fails with
async function failureOf(promise: Promise<unknown>): Promise<{ code: string; field?: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ManualCampaignError) return { code: error.code, ...(error.field ? { field: error.field } : {}) };
    throw error;
  }
  throw new Error("expected a ManualCampaignError");
}

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (work: unknown) =>
    typeof work === "function" ? (work as (tx: unknown) => unknown)(db) : Promise.all(work as unknown[]),
  );
  db.user.findUnique.mockResolvedValue({ walletAddress: OWNER.toLowerCase() });
  db.campaign.findFirst.mockResolvedValue(storedCampaign());
  db.campaignWinner.findMany.mockResolvedValue([]);
});

describe("pre-verified drafts", () => {
  test("a new draft saves its winners list with it, lowercase, and has one spot per wallet", async () => {
    db.campaign.create.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
    await createManualCampaignDraft("owner", draftBody, chain(), now);

    const { data } = db.campaign.create.mock.calls[0][0];
    expect(data.maxCompletions).toBe(2);
    expect(data.isPrivate).toBe(true);
    expect(data.task.create.verificationPolicy.create).toEqual({
      type: "PRE_VERIFIED",
      strategyKey: "CREATOR_WINNER_LIST_V1",
      configuration: {},
    });
    expect(data.winners.create).toEqual([
      expect.objectContaining({ walletAddress: ALICE.toLowerCase(), label: "First place", chainId: 31337 }),
      expect.objectContaining({ walletAddress: BOB.toLowerCase(), label: null, chainId: 31337 }),
    ]);
    // Each wallet has its own id, which is also its fulfillment id on chain
    expect(new Set(data.winners.create.map((winner: { id: string }) => winner.id)).size).toBe(2);
  });

  test("a manual draft saves no winners list", async () => {
    db.campaign.create.mockResolvedValue(storedManualCampaign({ status: "DRAFT", publishedAt: null }));
    const { verificationType: _type, winners: _winners, ...manual } = draftBody;
    await createManualCampaignDraft("owner", { ...manual, maxCompletions: 5 }, chain(), now);

    const { data } = db.campaign.create.mock.calls[0][0];
    expect(data.winners).toBeUndefined();
    expect(data.task.create.verificationPolicy.create.type).toBe("MANUAL");
  });

  test.each([
    ["a public pre-verified campaign", { isPrivate: false }, "isPrivate"],
    ["a list without wallets", { winners: [] }, "winners"],
    ["a spot count from the creator", { maxCompletions: 5 }, "maxCompletions"],
    ["the creator's own wallet on the list", { winners: [{ walletAddress: OWNER }] }, "winners[0].walletAddress"],
  ])("refuses %s", async (_case, overrides, field) => {
    expect(await failureOf(createManualCampaignDraft("owner", { ...draftBody, ...overrides }, chain(), now))).toEqual({
      code: "INVALID_INPUT",
      field,
    });
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  test("a manual campaign takes no winners list", async () => {
    const { verificationType: _type, ...manual } = draftBody;
    expect(await failureOf(createManualCampaignDraft("owner", { ...manual, maxCompletions: 5 }, chain(), now))).toEqual({
      code: "INVALID_INPUT",
      field: "winners",
    });
  });

  test("publishing sends the PreVerified verification type and the private visibility", () => {
    const campaign = parseStoredManualCampaign(storedCampaign({ status: "DRAFT", publishedAt: null }) as never);
    expect(createCampaignCall(campaign, 31337)).toEqual(
      expect.objectContaining({
        functionName: "createCampaignWithVisibility",
        args: [bytes32(CAMPAIGN_ID), 1, 2, 0, 30, 10, 1],
      }),
    );
  });

  test("an edit with a new list replaces the draft's list", async () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    await updateManualCampaignDraft("owner", CAMPAIGN_ID, { winners: [{ walletAddress: BOB }] }, chain(), now);

    expect(db.campaign.updateMany.mock.calls[0][0].data.maxCompletions).toBe(1);
    expect(db.campaignWinner.deleteMany).toHaveBeenCalledWith({ where: { campaignId: CAMPAIGN_ID } });
    expect(db.campaignWinner.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ campaignId: CAMPAIGN_ID, walletAddress: BOB.toLowerCase() }),
    ]);
    // Still pre-verified, so its verification policy is left alone
    expect(db.campaignVerificationPolicy.update).not.toHaveBeenCalled();
  });

  test("an edit that leaves the list out keeps it, and its spot count", async () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    db.campaignWinner.count.mockResolvedValue(3);
    await updateManualCampaignDraft("owner", CAMPAIGN_ID, { title: "Renamed" }, chain(), now);

    expect(db.campaign.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ title: "Renamed", maxCompletions: 3 }));
    expect(db.campaignWinner.deleteMany).not.toHaveBeenCalled();
    expect(db.campaignWinner.createMany).not.toHaveBeenCalled();
  });

  test("switching a draft back to MANUAL drops its list and changes its verification policy", async () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
    db.campaign.updateMany.mockResolvedValue({ count: 1 });
    await updateManualCampaignDraft("owner", CAMPAIGN_ID, { verificationType: "MANUAL", maxCompletions: 10 }, chain(), now);

    expect(db.campaignVerificationPolicy.update).toHaveBeenCalledWith({
      where: { taskId: "task-1" },
      data: { type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" },
    });
    expect(db.campaignWinner.deleteMany).toHaveBeenCalledWith({ where: { campaignId: CAMPAIGN_ID } });
    expect(db.campaignWinner.createMany).not.toHaveBeenCalled();
  });

  test("switching a manual draft to PRE_VERIFIED needs a list", async () => {
    db.campaign.findFirst.mockResolvedValue(storedManualCampaign({ status: "DRAFT", publishedAt: null }));
    expect(await failureOf(updateManualCampaignDraft("owner", CAMPAIGN_ID, { verificationType: "PRE_VERIFIED" }, chain(), now))).toEqual({
      code: "INVALID_INPUT",
      field: "winners",
    });
  });
});

describe("what doesn't apply to a pre-verified campaign", () => {
  test("it takes no proof, even with the link's code", async () => {
    db.campaignFulfillment.findFirst.mockResolvedValue(null);
    expect(await failureOf(
      submitManualCampaignProof("alice", CAMPAIGN_ID, { code: "secret-code", proof: "me" }, chain(), now),
    )).toEqual({ code: "NOT_ACCEPTING_SUBMISSIONS" });
  });

  test("without the link's code it is not found, like any private campaign", async () => {
    expect(await failureOf(submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "me" }, chain(), now))).toEqual({
      code: "CAMPAIGN_NOT_FOUND",
    });
  });

  test("an ended pre-verified Direct campaign can still be topped up for its listed winners", async () => {
    db.campaign.findFirst.mockResolvedValue(storedDirectCampaign({ status: "ENDED" }));
    const result = await prepareDirectCampaignFunding("owner", CAMPAIGN_ID, { runs: 1 }, chain(0n, 3));
    expect(result.chain).toEqual(expect.objectContaining({ functionName: "fundCampaign", valueWei: "400" }));
  });

  test("an ended manual Direct campaign still can't be", async () => {
    const base = storedDirectCampaign({ status: "ENDED" });
    db.campaign.findFirst.mockResolvedValue({
      ...base,
      task: { ...base.task, verificationPolicy: { id: "verification-1", type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" } },
    });
    expect(await failureOf(prepareDirectCampaignFunding("owner", CAMPAIGN_ID, { runs: 1 }, chain()))).toEqual({
      code: "NOT_ACCEPTING_SUBMISSIONS",
    });
  });
});

describe("contract calls", () => {
  test("the creator's call puts the listed wallet on chain under the winner's id", () => {
    expect(reserveWinnerCall(CAMPAIGN_ID, { id: WINNER_ID, walletAddress: ALICE.toLowerCase() }, 31337)).toEqual(
      expect.objectContaining({
        chainId: 31337,
        functionName: "createPreVerifiedCampaignFulfillment",
        args: [bytes32(CAMPAIGN_ID), bytes32(WINNER_ID), ALICE],
      }),
    );
  });

  test("the winner's claim names only the winner's id", () => {
    expect(claimWinnerCall(WINNER_ID, 31337)).toEqual(
      expect.objectContaining({ functionName: "completePreVerifiedCampaignFulfillment", args: [bytes32(WINNER_ID)] }),
    );
  });
});

describe("where each listed wallet stands", () => {
  const campaign = (overrides: Record<string, unknown> = {}) => parseStoredManualCampaign(storedCampaign(overrides) as never);
  const funded = { balanceWei: "400", runsRemaining: 1, chainStatus: "ACTIVE" as const };
  const empty = { balanceWei: "0", runsRemaining: 0, chainStatus: "PENDING_FUNDING" as const };

  test.each([
    ["a draft's wallet", { status: "DRAFT", publishedAt: null }, "LISTED", null, "NOT_PUBLISHED"],
    ["a listed wallet once published", {}, "LISTED", null, "READY_TO_PUT_ON_CHAIN"],
    ["a listed wallet on an ended campaign", { status: "ENDED" }, "LISTED", null, "READY_TO_PUT_ON_CHAIN"],
    ["a listed wallet with no funded run", {}, "LISTED", empty, "WAITING_FOR_FUNDS"],
    ["a wallet on chain", {}, "RESERVED", funded, "WAITING_FOR_CLAIM"],
    ["a wallet on chain with no funded run", {}, "RESERVED", empty, "WAITING_FOR_FUNDS"],
    ["a claimed wallet", {}, "CLAIMED", empty, "CLAIMED"],
    ["a paid wallet", {}, "REWARDED", null, "CLAIMED"],
    ["a cancelled campaign's wallet", { status: "CANCELLED" }, "LISTED", null, "CLOSED"],
  ])("the creator sees %s", (_case, campaignOverrides, status, funding, state) => {
    expect(listedWinnerStateFor(campaign(campaignOverrides), { status } as never, funding)).toBe(state);
  });

  test.each([
    ["listed but not on chain yet", {}, "LISTED", null, "NOT_ON_CHAIN_YET"],
    ["on chain", {}, "RESERVED", null, "CLAIMABLE"],
    ["on chain after the campaign ended", { status: "ENDED" }, "RESERVED", null, "CLAIMABLE"],
    ["on chain while paused", { status: "PAUSED" }, "RESERVED", null, "PAUSED"],
    ["on chain with no funded run", {}, "RESERVED", empty, "WAITING_FOR_FUNDS"],
    ["on chain with a funded run", {}, "RESERVED", funded, "CLAIMABLE"],
    ["already claimed", {}, "REWARDED", null, "CLAIMED"],
  ])("the winner sees a wallet %s", (_case, campaignOverrides, status, funding, state) => {
    expect(claimStateFor(campaign(campaignOverrides), { status } as never, funding)).toBe(state);
  });

  test("a Direct campaign tells its creator how many more runs every unpaid winner needs", () => {
    const direct = parseStoredManualCampaign(storedDirectCampaign() as never);
    const winners = [{ status: "LISTED" }, { status: "RESERVED" }, { status: "RESERVED" }, { status: "REWARDED" }] as never[];
    expect(fundingNeeded(direct, funded, winners)).toEqual({
      balanceWei: "400",
      runsRemaining: 1,
      chainStatus: "ACTIVE",
      rewardPerRunWei: "400",
      unpaidWinners: 3,
      runsShort: 2,
      topUpWei: "800",
    });
    expect(fundingNeeded(campaign(), null, winners)).toBeNull();
  });
});

describe("the creator's list", () => {
  test("lists the wallets not taken off it, with a Direct campaign's funding from the chain", async () => {
    db.campaign.findFirst.mockResolvedValue(storedDirectCampaign());
    db.campaignWinner.findMany.mockResolvedValue([storedWinner()]);
    const fake = chain(800n);
    const result = await listCampaignWinners("owner", CAMPAIGN_ID, fake);

    expect(db.campaignWinner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: CAMPAIGN_ID, status: { not: "REMOVED" } } }),
    );
    expect(result.winners).toHaveLength(1);
    expect(result.funding).toEqual({ balanceWei: "800", runsRemaining: 2, chainStatus: "ACTIVE" });
    expect(fake.getCampaign).toHaveBeenCalledWith(bytes32(CAMPAIGN_ID));
  });

  test("only the creator sees it", async () => {
    expect(await failureOf(listCampaignWinners("someone-else", CAMPAIGN_ID, chain()))).toEqual({ code: "NOT_CAMPAIGN_OWNER" });
  });

  test("a manual campaign has no list", async () => {
    db.campaign.findFirst.mockResolvedValue(storedManualCampaign());
    expect(await failureOf(listCampaignWinners("owner", CAMPAIGN_ID, chain()))).toEqual({ code: "NOT_PRE_VERIFIED" });
  });
});

describe("adding wallets", () => {
  test("an active campaign takes more wallets before its end date, and gains a spot for each", async () => {
    db.campaignWinner.findMany.mockResolvedValueOnce([storedWinner()]).mockResolvedValue([]);
    await addCampaignWinners("owner", CAMPAIGN_ID, { winners: [{ walletAddress: BOB, label: "Late entry" }] }, chain(), now);

    expect(db.campaignWinner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ campaignId: CAMPAIGN_ID, walletAddress: BOB.toLowerCase(), label: "Late entry", chainId: 31337 }),
    });
    expect(db.campaign.update).toHaveBeenCalledWith({ where: { id: CAMPAIGN_ID }, data: { maxCompletions: 2 } });
  });

  test("a wallet taken off earlier comes back under the same id, since it never went on chain", async () => {
    db.campaignWinner.findMany.mockResolvedValueOnce([storedWinner({ status: "REMOVED" })]).mockResolvedValue([]);
    await addCampaignWinners("owner", CAMPAIGN_ID, { winners: [{ walletAddress: ALICE }] }, chain(), now);

    expect(db.campaignWinner.update).toHaveBeenCalledWith({ where: { id: WINNER_ID }, data: { status: "LISTED", label: null } });
    expect(db.campaignWinner.create).not.toHaveBeenCalled();
    expect(db.campaign.update).toHaveBeenCalledWith({ where: { id: CAMPAIGN_ID }, data: { maxCompletions: 1 } });
  });

  test("refuses a wallet that is already listed", async () => {
    db.campaignWinner.findMany.mockResolvedValueOnce([storedWinner({ status: "RESERVED" })]);
    expect(await failureOf(addCampaignWinners("owner", CAMPAIGN_ID, { winners: [{ walletAddress: ALICE }] }, chain(), now))).toEqual({
      code: "ALREADY_LISTED",
      field: "winners[0].walletAddress",
    });
    expect(db.campaignWinner.create).not.toHaveBeenCalled();
  });

  test.each([
    ["after the end date", {}, new Date("2026-11-02T00:00:00.000Z")],
    ["while paused", { status: "PAUSED" }, now],
    ["once ended", { status: "ENDED" }, now],
  ])("the list is closed %s", async (_case, overrides, when) => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign(overrides));
    expect(await failureOf(addCampaignWinners("owner", CAMPAIGN_ID, { winners: [{ walletAddress: BOB }] }, chain(), when))).toEqual({
      code: "LIST_CLOSED",
    });
  });

  test("keeps the list at 100 wallets", async () => {
    db.campaignWinner.findMany.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, index) => storedWinner({ id: `w-${index}`, walletAddress: `0x${(index + 1).toString(16).padStart(40, "0")}` })),
    );
    expect(await failureOf(addCampaignWinners("owner", CAMPAIGN_ID, { winners: [{ walletAddress: BOB }] }, chain(), now))).toEqual({
      code: "INVALID_INPUT",
      field: "winners",
    });
  });
});

describe("removing a wallet", () => {
  test("takes a listed wallet off, leaving one less spot", async () => {
    db.campaignWinner.findFirst.mockResolvedValue(storedWinner());
    db.campaignWinner.count.mockResolvedValue(2);
    db.campaignWinner.updateMany.mockResolvedValue({ count: 1 });
    await removeCampaignWinner("owner", CAMPAIGN_ID, WINNER_ID, chain());

    expect(db.campaignWinner.updateMany).toHaveBeenCalledWith({
      where: { id: WINNER_ID, status: "LISTED" },
      data: { status: "REMOVED" },
    });
    expect(db.campaign.update).toHaveBeenCalledWith({ where: { id: CAMPAIGN_ID }, data: { maxCompletions: 1 } });
  });

  test("a wallet already on chain stays, since the contract can't take it off", async () => {
    db.campaignWinner.findFirst.mockResolvedValue(storedWinner({ status: "RESERVED" }));
    expect(await failureOf(removeCampaignWinner("owner", CAMPAIGN_ID, WINNER_ID, chain()))).toEqual({ code: "NOT_REMOVABLE" });
  });

  test("the last wallet on the list stays", async () => {
    db.campaignWinner.findFirst.mockResolvedValue(storedWinner());
    db.campaignWinner.count.mockResolvedValue(1);
    expect(await failureOf(removeCampaignWinner("owner", CAMPAIGN_ID, WINNER_ID, chain()))).toEqual({ code: "NOT_REMOVABLE" });
  });

  test("a wallet that went on chain meanwhile stays", async () => {
    db.campaignWinner.findFirst.mockResolvedValue(storedWinner());
    db.campaignWinner.count.mockResolvedValue(2);
    db.campaignWinner.updateMany.mockResolvedValue({ count: 0 });
    expect(await failureOf(removeCampaignWinner("owner", CAMPAIGN_ID, WINNER_ID, chain()))).toEqual({ code: "NOT_REMOVABLE" });
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  test("a wallet not on the list is not found", async () => {
    db.campaignWinner.findFirst.mockResolvedValue(null);
    expect(await failureOf(removeCampaignWinner("owner", CAMPAIGN_ID, OTHER_WINNER_ID, chain()))).toEqual({ code: "WINNER_NOT_FOUND" });
  });
});

describe("the winner's side", () => {
  test("lists every published campaign that names the user's wallet, matched in lowercase", async () => {
    db.user.findUnique.mockResolvedValue({ walletAddress: ALICE });
    db.campaignWinner.findMany.mockResolvedValue([
      { ...storedWinner({ status: "RESERVED" }), campaign: storedCampaign() },
    ]);
    const rewards = await listMyPreVerifiedRewards("alice", chain());

    expect(db.campaignWinner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletAddress: ALICE.toLowerCase(),
          status: { not: "REMOVED" },
          campaign: { publishedAt: { not: null }, status: { in: ["ACTIVE", "PAUSED", "ENDED"] } },
        },
      }),
    );
    expect(rewards).toEqual([expect.objectContaining({ state: "CLAIMABLE", winner: expect.objectContaining({ id: WINNER_ID }) })]);
  });

  test("reads each Direct campaign's funding once, and only for wallets on chain", async () => {
    db.user.findUnique.mockResolvedValue({ walletAddress: ALICE });
    db.campaignWinner.findMany.mockResolvedValue([
      { ...storedWinner({ status: "RESERVED" }), campaign: storedDirectCampaign() },
      { ...storedWinner({ id: OTHER_WINNER_ID, status: "RESERVED" }), campaign: storedDirectCampaign() },
      { ...storedWinner({ id: "w-3", status: "LISTED" }), campaign: storedDirectCampaign({ id: "other-campaign", key: "other-campaign" }) },
    ]);
    const fake = chain(0n, 3);
    const rewards = await listMyPreVerifiedRewards("alice", fake);

    expect(fake.getCampaign).toHaveBeenCalledTimes(1);
    expect(rewards.map((reward) => reward.state)).toEqual(["WAITING_FOR_FUNDS", "WAITING_FOR_FUNDS", "NOT_ON_CHAIN_YET"]);
  });

  test("a winner's entry on one campaign", async () => {
    db.user.findUnique.mockResolvedValue({ walletAddress: ALICE });
    db.campaignWinner.findFirst.mockResolvedValue(storedWinner({ status: "RESERVED" }));
    const entry = await getMyCampaignWinner("alice", CAMPAIGN_ID, chain());

    expect(db.campaignWinner.findFirst).toHaveBeenCalledWith({
      where: { campaignId: CAMPAIGN_ID, walletAddress: ALICE.toLowerCase(), status: { not: "REMOVED" } },
    });
    expect(entry.state).toBe("CLAIMABLE");
  });

  test("someone not on the list has no entry", async () => {
    db.user.findUnique.mockResolvedValue({ walletAddress: BOB });
    db.campaignWinner.findFirst.mockResolvedValue(null);
    expect(await failureOf(getMyCampaignWinner("bob", CAMPAIGN_ID, chain()))).toEqual({ code: "WINNER_NOT_FOUND" });
  });

  test("a manual campaign answers the same way, so a private one stays behind its link", async () => {
    db.campaign.findFirst.mockResolvedValue(storedManualCampaign());
    db.user.findUnique.mockResolvedValue({ walletAddress: ALICE });
    expect(await failureOf(getMyCampaignWinner("alice", CAMPAIGN_ID, chain()))).toEqual({ code: "WINNER_NOT_FOUND" });
    expect(db.campaignWinner.findFirst).not.toHaveBeenCalled();
  });

  test("a draft's list isn't shown to its winners yet", async () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
    db.user.findUnique.mockResolvedValue({ walletAddress: ALICE });
    expect(await failureOf(getMyCampaignWinner("alice", CAMPAIGN_ID, chain()))).toEqual({ code: "WINNER_NOT_FOUND" });
    expect(db.campaignWinner.findFirst).not.toHaveBeenCalled();
  });
});
