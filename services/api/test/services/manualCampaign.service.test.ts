// Purpose: Tests the user campaign rules: drafts, editing, pausing, submitting proof, and the creator's review
// Notes:
// - Prisma is mocked; each test sets up the rows it needs
// - The chain is a stand-in passed to each call, so the admin's points maximum is under the test's control

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma.js";
import {
  ManualCampaignError,
  approveManualCampaignSubmission,
  changeManualCampaignStatus,
  countSpotsTaken,
  createCampaignCall,
  createManualCampaignDraft,
  decideFulfillmentCall,
  listManualCampaignSubmissions,
  listOpenManualCampaigns,
  listOwnedManualCampaigns,
  prepareDirectCampaignFunding,
  getDirectRewardAccount,
  prepareDirectRewardWithdrawal,
  rejectManualCampaignSubmission,
  submitFulfillmentCall,
  submitManualCampaignProof,
  updateManualCampaignDraft,
  type ManualCampaignChain,
} from "@/services/manualCampaign.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    campaignTask: { update: jest.fn() },
    campaignRewardPolicy: { update: jest.fn() },
    user: { findUnique: jest.fn() },
    directRewardEvent: { findMany: jest.fn() },
    campaignFulfillment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      groupBy: jest.fn(),
    },
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
const FULFILLMENT_ID = "22222222-2222-4222-8222-222222222222";
const bytes32 = (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}`;

function chain(maximum = 1000n): ManualCampaignChain & { getMaxCampaignPointsPerCompletion: jest.Mock } {
  return {
    chainId: 31337,
    getMaxCampaignPointsPerCompletion: jest.fn().mockResolvedValue(maximum),
    getMaxCampaignDirectRewardPerCompletion: jest.fn().mockResolvedValue(maximum),
    getCampaign: jest.fn(),
    getDirectRewardBalance: jest.fn(),
  };
}

// A campaign row as Prisma returns it with the service's includes
function storedCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    key: CAMPAIGN_ID,
    title: "Follow Dave",
    description: "",
    instructions: "Follow @dave and paste the link",
    isSystem: false,
    status: "ACTIVE",
    schemaVersion: 1,
    ownerId: "dave",
    owner: { name: "Dave", walletAddress: "0xdave" },
    maxCompletions: 2,
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    publishedAt: new Date("2026-10-17T00:00:00.000Z"),
    publishTransactionHash: "0xpublish",
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    updatedAt: new Date("2026-10-16T00:00:00.000Z"),
    task: {
      id: "task-1",
      type: "BOUNTY",
      strategyKey: "BOUNTY_V1",
      configuration: { category: "SOCIAL_MEDIA" },
      verificationPolicy: { id: "verification-1", type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" },
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
    owner: { name: "Dave", walletAddress: "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd" },
    chainStatus: "ACTIVE",
    chainBalanceWei: "900",
    task: {
      ...base.task,
      rewardPolicy: {
        id: "reward-1",
        type: "DIRECT",
        strategyKey: "CAMPAIGN_DIRECT_NATIVE_V1",
        configuration: { completerRewardWei: "300", referralPoolWei: "100", initialFundingRuns: 2 },
      },
    },
    ...overrides,
  };
}

function storedFulfillment(overrides: Record<string, unknown> = {}) {
  return {
    id: FULFILLMENT_ID,
    taskId: "task-1",
    participantId: "alice",
    status: "UNDER_REVIEW",
    proof: "https://x.com/alice",
    rejectionReason: null,
    verifiedAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

const draftBody = {
  title: "Follow Dave",
  instructions: "Follow @dave and paste the link",
  category: "SOCIAL_MEDIA",
  completerPoints: 30,
  referralPoolPoints: 10,
  maxCompletions: 2,
  endsAt: "2026-11-01T00:00:00.000Z",
};

// The error code a call fails with
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ManualCampaignError) return error.code;
    throw error;
  }
  throw new Error("expected a ManualCampaignError");
}

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (work: unknown) =>
    typeof work === "function" ? (work as (tx: unknown) => unknown)(db) : Promise.all(work as unknown[]),
  );
  db.campaign.findFirst.mockResolvedValue(storedCampaign());
  db.campaign.updateMany.mockResolvedValue({ count: 1 });
  db.campaignFulfillment.findFirst.mockResolvedValue(null);
  db.campaignFulfillment.groupBy.mockResolvedValue([]);
  db.campaignFulfillment.updateMany.mockResolvedValue({ count: 1 });
});

describe("contract calls", () => {
  test("publishing sends the campaign's id, the bounty, manual and points types, and its reward", () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign());
    const campaign = { id: CAMPAIGN_ID, completerPoints: 30, referralPoolPoints: 10 } as any;

    expect(createCampaignCall(campaign)).toEqual(expect.objectContaining({
      functionName: "createCampaign",
      args: [bytes32(CAMPAIGN_ID), 1, 1, 0, 30, 10],
      chainId: 31337,
    }));
    expect(createCampaignCall(campaign).valueWei).toBeUndefined();
  });

  test("submitting and deciding name the campaign and submission by their on-chain ids", () => {
    expect(submitFulfillmentCall(CAMPAIGN_ID, FULFILLMENT_ID)).toEqual(expect.objectContaining({
      functionName: "submitCampaignFulfillment",
      args: [bytes32(CAMPAIGN_ID), bytes32(FULFILLMENT_ID)],
    }));
    expect(decideFulfillmentCall("approve", FULFILLMENT_ID).functionName).toBe("verifyCampaignFulfillment");
    expect(decideFulfillmentCall("reject", FULFILLMENT_ID)).toEqual(expect.objectContaining({
      functionName: "rejectCampaignFulfillment",
      args: [bytes32(FULFILLMENT_ID)],
    }));
  });

  test("Direct creation uses decimal-string args and the exact initial payable value", () => {
    const call = createCampaignCall({
      id: CAMPAIGN_ID,
      rewardType: "DIRECT",
      completerRewardWei: "3000000000000000",
      referralPoolWei: "1000000000000000",
      initialFundingRuns: 10,
    } as any, 31337);
    expect(call).toEqual(expect.objectContaining({
      chainId: 31337,
      functionName: "createCampaign",
      args: [bytes32(CAMPAIGN_ID), 1, 1, 1, "3000000000000000", "1000000000000000"],
      valueWei: "40000000000000000",
    }));
  });
});

describe("Direct campaign funding", () => {
  test("prepares an exact run-based top-up from authoritative chain state", async () => {
    db.campaign.findFirst.mockResolvedValue(storedDirectCampaign());
    const directChain = chain();
    (directChain.getCampaign as jest.Mock).mockResolvedValue({
      owner: "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd",
      rewardType: 1,
      status: 3,
      completerReward: 300n,
      referralPool: 100n,
      balance: 100n,
    });

    const result = await prepareDirectCampaignFunding("dave", CAMPAIGN_ID, { runs: 10 }, directChain);

    expect(result.funding).toEqual({
      requestedRuns: 10,
      valueWei: "4000",
      currentBalanceWei: "100",
      currentRunsRemaining: 0,
      projectedBalanceWei: "4100",
      projectedRunsRemaining: 10,
    });
    expect(result.chain).toEqual(expect.objectContaining({ functionName: "fundCampaign", valueWei: "4000" }));
    expect(db.campaign.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { chainBalanceWei: "100", chainStatus: "PENDING_FUNDING" },
    }));
  });

  test("does not constrain funded runs by maxCompletions", async () => {
    db.campaign.findFirst.mockResolvedValue(storedDirectCampaign({ maxCompletions: 1 }));
    const directChain = chain();
    (directChain.getCampaign as jest.Mock).mockResolvedValue({
      owner: "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd", rewardType: 1, status: 1, balance: 400n,
    });
    expect((await prepareDirectCampaignFunding("dave", CAMPAIGN_ID, { runs: 100 }, directChain)).funding.valueWei).toBe("40000");
  });
});

describe("Direct reward account", () => {
  const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ walletAddress: wallet });
    db.directRewardEvent.findMany.mockResolvedValue([]);
  });

  test("reads the authoritative balance and prepares one full withdrawal", async () => {
    const directChain = chain();
    (directChain.getDirectRewardBalance as jest.Mock).mockResolvedValue(7_000_000_000_000_000n);
    expect(await getDirectRewardAccount("alice", directChain)).toEqual(expect.objectContaining({
      chainId: 31337,
      balanceWei: "7000000000000000",
    }));
    const prepared = await prepareDirectRewardWithdrawal("alice", {}, directChain);
    expect(prepared).toEqual(expect.objectContaining({
      balanceWei: "7000000000000000",
      destination: expect.any(String),
      chain: expect.objectContaining({ functionName: "withdrawDirectRewards" }),
    }));
  });

  test("rejects zero balance and an invalid destination", async () => {
    const directChain = chain();
    (directChain.getDirectRewardBalance as jest.Mock).mockResolvedValue(0n);
    expect(await codeOf(prepareDirectRewardWithdrawal("alice", {}, directChain))).toBe("NO_DIRECT_REWARDS");
    (directChain.getDirectRewardBalance as jest.Mock).mockResolvedValue(1n);
    expect(await codeOf(prepareDirectRewardWithdrawal("alice", { destination: "0x0" }, directChain))).toBe("INVALID_DESTINATION");
  });
});

describe("createManualCampaignDraft", () => {
  test("saves a draft owned by the creator, with a bounty task, manual verification and a points reward", async () => {
    db.campaign.create.mockImplementation(async ({ data }: any) =>
      storedCampaign({ id: data.id, key: data.key, status: "DRAFT", publishedAt: null }),
    );

    const campaign = await createManualCampaignDraft("dave", draftBody, chain(), now);

    const { data } = db.campaign.create.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        status: "DRAFT",
        ownerId: "dave",
        isSystem: false,
        maxCompletions: 2,
        endsAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    );
    // The id is also the key, and becomes the on-chain id
    expect(data.key).toBe(data.id);
    expect(data.task.create).toEqual(
      expect.objectContaining({ type: "BOUNTY", strategyKey: "BOUNTY_V1", configuration: { category: "SOCIAL_MEDIA" } }),
    );
    expect(data.task.create.verificationPolicy.create).toEqual(
      expect.objectContaining({ type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" }),
    );
    expect(data.task.create.rewardPolicy.create).toEqual(
      expect.objectContaining({
        type: "POINTS",
        strategyKey: "CAMPAIGN_POINTS_V1",
        configuration: { completerPoints: 30, referralPoolPoints: 10 },
      }),
    );
    expect(campaign.status).toBe("DRAFT");
  });

  test("refuses a reward above the admin's maximum for one completion", async () => {
    const error = await createManualCampaignDraft("dave", draftBody, chain(39n), now).catch((e) => e);

    expect(error).toBeInstanceOf(ManualCampaignError);
    expect(error.code).toBe("REWARD_ABOVE_MAXIMUM");
    expect(error.message).toContain("at most 39 points");
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  test("allows a reward exactly at the maximum", async () => {
    db.campaign.create.mockResolvedValue(storedCampaign({ status: "DRAFT" }));

    await createManualCampaignDraft("dave", draftBody, chain(40n), now);

    expect(db.campaign.create).toHaveBeenCalled();
  });

  test("reports the chain as unavailable when the maximum can't be read", async () => {
    const offline = chain();
    offline.getMaxCampaignPointsPerCompletion.mockRejectedValue(new Error("connection refused"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    expect(await codeOf(createManualCampaignDraft("dave", draftBody, offline, now))).toBe("CHAIN_UNAVAILABLE");
  });

  test("reports which field is invalid", async () => {
    const error = await createManualCampaignDraft("dave", { ...draftBody, maxCompletions: 0 }, chain(), now).catch(
      (e) => e,
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.field).toBe("maxCompletions");
  });
});

describe("updateManualCampaignDraft", () => {
  beforeEach(() => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "DRAFT", publishedAt: null }));
  });

  test("changes the given fields of a draft and keeps the rest", async () => {
    await updateManualCampaignDraft("dave", CAMPAIGN_ID, { title: "Follow Dave Inc", referralPoolPoints: 20 }, chain(), now);

    expect(db.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID, status: "DRAFT" },
      data: expect.objectContaining({ title: "Follow Dave Inc", maxCompletions: 2 }),
    });
    expect(db.campaignTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { configuration: { category: "SOCIAL_MEDIA" } },
    });
    expect(db.campaignRewardPolicy.update).toHaveBeenCalledWith({
      where: { id: "reward-1" },
      data: {
        type: "POINTS",
        strategyKey: "CAMPAIGN_POINTS_V1",
        configuration: { completerPoints: 30, referralPoolPoints: 20 },
      },
    });
  });

  test("only the creator can edit", async () => {
    expect(await codeOf(updateManualCampaignDraft("mallory", CAMPAIGN_ID, { title: "Mine" }, chain(), now))).toBe(
      "NOT_CAMPAIGN_OWNER",
    );
  });

  test("a published campaign can't be edited", async () => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: "ACTIVE" }));

    expect(await codeOf(updateManualCampaignDraft("dave", CAMPAIGN_ID, { title: "Late" }, chain(), now))).toBe(
      "NOT_EDITABLE",
    );
  });

  test("an edit loses to the chain publishing the draft at the same moment", async () => {
    db.campaign.updateMany.mockResolvedValue({ count: 0 });

    expect(await codeOf(updateManualCampaignDraft("dave", CAMPAIGN_ID, { title: "Late" }, chain(), now))).toBe(
      "NOT_EDITABLE",
    );
    expect(db.campaignRewardPolicy.update).not.toHaveBeenCalled();
  });

  test("an unknown campaign is not found", async () => {
    db.campaign.findFirst.mockResolvedValue(null);

    expect(await codeOf(updateManualCampaignDraft("dave", "missing", {}, chain(), now))).toBe("CAMPAIGN_NOT_FOUND");
  });
});

describe("changeManualCampaignStatus", () => {
  test.each([
    ["ACTIVE", "PAUSED"],
    ["PAUSED", "ACTIVE"],
    ["ACTIVE", "ENDED"],
    ["PAUSED", "CANCELLED"],
    ["DRAFT", "CANCELLED"],
  ])("a %s campaign can become %s", async (from, to) => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: from }));

    await changeManualCampaignStatus("dave", CAMPAIGN_ID, to);

    expect(db.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID, status: from },
      data: { status: to },
    });
  });

  test.each([
    // Only the chain makes a draft active
    ["DRAFT", "ACTIVE"],
    ["ENDED", "ACTIVE"],
    ["CANCELLED", "ACTIVE"],
    ["ACTIVE", "DRAFT"],
    ["ACTIVE", "nonsense"],
  ])("a %s campaign can't become %s", async (from, to) => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign({ status: from }));

    expect(await codeOf(changeManualCampaignStatus("dave", CAMPAIGN_ID, to))).toBe("INVALID_STATUS_CHANGE");
    expect(db.campaign.updateMany).not.toHaveBeenCalled();
  });

  test("only the creator can change it", async () => {
    expect(await codeOf(changeManualCampaignStatus("mallory", CAMPAIGN_ID, "PAUSED"))).toBe("NOT_CAMPAIGN_OWNER");
  });
});

describe("submitManualCampaignProof", () => {
  test("saves the proof as SUBMITTED, once per person", async () => {
    db.campaignFulfillment.create.mockImplementation(async ({ data }: any) => data);

    const { fulfillment } = await submitManualCampaignProof(
      "alice",
      CAMPAIGN_ID,
      { proof: "https://x.com/alice" },
      chain(),
      now,
    );

    expect(fulfillment).toEqual(
      expect.objectContaining({
        taskId: "task-1",
        participantId: "alice",
        attempt: 1,
        idempotencyKey: "manual:task-1:alice",
        status: "SUBMITTED",
        chainId: 31337,
        proof: "https://x.com/alice",
      }),
    );
  });

  test("creators can't complete their own campaigns", async () => {
    expect(await codeOf(submitManualCampaignProof("dave", CAMPAIGN_ID, { proof: "https://x.com/dave" }, chain(), now))).toBe(
      "OWN_CAMPAIGN",
    );
  });

  test.each([
    ["a paused", { status: "PAUSED" }],
    ["an ended", { status: "ENDED" }],
    ["a cancelled", { status: "CANCELLED" }],
    ["a draft", { status: "DRAFT", publishedAt: null }],
    ["a past-its-end-date", { endsAt: new Date("2026-10-17T11:00:00.000Z") }],
  ])("%s campaign takes no submissions", async (_case, overrides) => {
    db.campaign.findFirst.mockResolvedValue(storedCampaign(overrides));

    expect(await codeOf(submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "https://x.com/a" }, chain(), now))).toBe(
      "NOT_ACCEPTING_SUBMISSIONS",
    );
  });

  test("a second submission from the same person is refused, even after a rejection", async () => {
    db.campaignFulfillment.findFirst.mockResolvedValue(storedFulfillment({ status: "REJECTED" }));

    expect(await codeOf(submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "https://x.com/a" }, chain(), now))).toBe(
      "ALREADY_SUBMITTED",
    );
  });

  test("a full campaign takes no more, counting every submission but rejected ones", async () => {
    db.campaignFulfillment.groupBy.mockResolvedValue([{ taskId: "task-1", _count: { _all: 2 } }]);

    expect(await codeOf(submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "https://x.com/a" }, chain(), now))).toBe(
      "CAMPAIGN_FULL",
    );
    expect(db.campaignFulfillment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: { in: ["task-1"] }, status: { not: "REJECTED" } } }),
    );
  });

  test("social media proof must be a link", async () => {
    const error = await submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "@alice" }, chain(), now).catch((e) => e);

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.field).toBe("proof");
    expect(db.campaignFulfillment.create).not.toHaveBeenCalled();
  });

  test("two submissions from the same person at the same moment save only one", async () => {
    db.campaignFulfillment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" }),
    );

    expect(await codeOf(submitManualCampaignProof("alice", CAMPAIGN_ID, { proof: "https://x.com/a" }, chain(), now))).toBe(
      "ALREADY_SUBMITTED",
    );
  });
});

describe("reviewing submissions", () => {
  beforeEach(() => {
    db.campaignFulfillment.findFirst.mockResolvedValue(storedFulfillment());
    db.campaignFulfillment.findUniqueOrThrow.mockImplementation(async () => storedFulfillment({ status: "APPROVED" }));
  });

  test("the creator's queue lists the campaign's submissions, optionally by status", async () => {
    db.campaignFulfillment.findMany.mockResolvedValue([storedFulfillment()]);

    await listManualCampaignSubmissions("dave", CAMPAIGN_ID, "UNDER_REVIEW");

    expect(db.campaignFulfillment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: "task-1", status: "UNDER_REVIEW" }, orderBy: { createdAt: "asc" } }),
    );
    expect(await codeOf(listManualCampaignSubmissions("dave", CAMPAIGN_ID, "LOST"))).toBe("INVALID_INPUT");
    expect(await codeOf(listManualCampaignSubmissions("mallory", CAMPAIGN_ID))).toBe("NOT_CAMPAIGN_OWNER");
  });

  test("approving a submission under review records the decision", async () => {
    await approveManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, now);

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, status: "UNDER_REVIEW", verifiedAt: null, rejectedAt: null },
      data: { status: "APPROVED", rejectionReason: null, reviewedAt: now },
    });
  });

  test("rejecting records the reason, and needs one", async () => {
    await rejectManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, { reason: "Wrong profile" }, now);

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED", rejectionReason: "Wrong profile", reviewedAt: now } }),
    );
    expect(await codeOf(rejectManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, {}, now))).toBe("INVALID_INPUT");
  });

  test("the creator can change their mind until the chain has the decision", async () => {
    db.campaignFulfillment.findFirst.mockResolvedValue(
      storedFulfillment({ status: "REJECTED", rejectionReason: "Wrong profile" }),
    );

    await approveManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, now);

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, status: "REJECTED", verifiedAt: null, rejectedAt: null },
      data: { status: "APPROVED", rejectionReason: null, reviewedAt: now },
    });
  });

  test.each([
    ["one the chain doesn't have yet", { status: "SUBMITTED" }, "not on chain yet"],
    ["one approved on chain", { status: "APPROVED", verifiedAt: new Date() }, "already been decided"],
    ["one rejected on chain", { status: "REJECTED", rejectedAt: new Date() }, "already been decided"],
    ["one already paid", { status: "REWARDED", verifiedAt: new Date() }, "already been decided"],
  ])("can't review %s", async (_case, overrides, message) => {
    db.campaignFulfillment.findFirst.mockResolvedValue(storedFulfillment(overrides));

    const error = await approveManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, now).catch((e) => e);

    expect(error.code).toBe("NOT_REVIEWABLE");
    expect(error.message).toContain(message);
    expect(db.campaignFulfillment.updateMany).not.toHaveBeenCalled();
  });

  test("a decision loses to the chain confirming another at the same moment", async () => {
    db.campaignFulfillment.updateMany.mockResolvedValue({ count: 0 });

    expect(await codeOf(approveManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, now))).toBe("NOT_REVIEWABLE");
  });

  test("only the creator reviews, and only their own campaign's submissions", async () => {
    expect(await codeOf(approveManualCampaignSubmission("alice", CAMPAIGN_ID, FULFILLMENT_ID, now))).toBe(
      "NOT_CAMPAIGN_OWNER",
    );

    db.campaignFulfillment.findFirst.mockResolvedValue(null);
    expect(await codeOf(approveManualCampaignSubmission("dave", CAMPAIGN_ID, FULFILLMENT_ID, now))).toBe(
      "SUBMISSION_NOT_FOUND",
    );
    expect(db.campaignFulfillment.findFirst).toHaveBeenCalledWith({ where: { id: FULFILLMENT_ID, taskId: "task-1" } });
  });
});

describe("listing", () => {
  test("the board shows active user campaigns that have not ended", async () => {
    db.campaign.findMany.mockResolvedValue([storedCampaign()]);

    const open = await listOpenManualCampaigns(now);

    expect(open).toHaveLength(1);
    expect(db.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isSystem: false, ownerId: { not: null }, status: "ACTIVE", endsAt: { gt: now } },
      }),
    );
  });

  test("a creator's campaigns come with how many submissions are in each state", async () => {
    db.campaign.findMany.mockResolvedValue([storedCampaign()]);
    db.campaignFulfillment.groupBy.mockResolvedValue([
      { taskId: "task-1", status: "UNDER_REVIEW", _count: { _all: 2 } },
      { taskId: "task-1", status: "REWARDED", _count: { _all: 5 } },
      { taskId: "other-task", status: "REWARDED", _count: { _all: 9 } },
    ]);

    const [owned] = await listOwnedManualCampaigns("dave");

    expect(owned.submissions).toEqual({ SUBMITTED: 0, UNDER_REVIEW: 2, APPROVED: 0, REJECTED: 0, REWARDED: 5 });
  });

  test("counting spots for no campaigns asks the database nothing", async () => {
    expect(await countSpotsTaken([])).toEqual(new Map());
    expect(db.campaignFulfillment.groupBy).not.toHaveBeenCalled();
  });
});
