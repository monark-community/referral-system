// Purpose: Tests how the chain's user campaign events update the database
// Notes:
// - Prisma is mocked; it has no referral table here, so a campaign payout touching invite points would throw
// - Every handler is run twice somewhere below, since live listening and catch-up can deliver an event twice

import { prisma } from "@/lib/prisma.js";
import {
  applyCampaignCreated,
  applyCampaignFulfillmentRejected,
  applyCampaignFulfillmentSubmitted,
  applyCampaignFulfillmentVerified,
  applyCampaignRewardPaid,
  applyDirectRewardAccrued,
  applyDirectRewardsWithdrawn,
} from "@/services/manualCampaignProjection.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findUnique: jest.fn(), updateMany: jest.fn() },
    campaignRewardPolicy: { update: jest.fn() },
    campaignFulfillment: { findUnique: jest.fn(), updateMany: jest.fn() },
    referralPointAllocation: { upsert: jest.fn() },
    directCampaignSettlement: { upsert: jest.fn() },
    directRewardEvent: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
// The real conversion, so events can name rows by their on-chain ids
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({
    bytes32ToUuid: (bytes32: string) => {
      const hex = bytes32.slice(2, 34);
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
    },
  }),
  { virtual: true },
);

const db = prisma as any;
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const FULFILLMENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const bytes32 = (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}` as `0x${string}`;

// Wallets as events carry them (checksummed) and as the database stores them (lowercase)
const DAVE = "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd";
const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const BOB = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";
const CAROL = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc";

const position = (transactionHash: string, blockNumber: bigint, logIndex: number) => ({
  transactionHash: transactionHash as `0x${string}`,
  blockNumber,
  logIndex,
});

const createdEvent = (overrides = {}) => ({
  campaignId: bytes32(CAMPAIGN_ID),
  owner: DAVE as `0x${string}`,
  taskType: 1,
  verificationType: 1,
  rewardType: 0,
  completerReward: 30n,
  referralPool: 10n,
  ...position("0xCREATED", 10n, 1),
  ...overrides,
});

const submissionEvent = (overrides = {}) => ({
  campaignId: bytes32(CAMPAIGN_ID),
  fulfillmentId: bytes32(FULFILLMENT_ID),
  participant: ALICE as `0x${string}`,
  ...overrides,
});

function storedCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    isSystem: false,
    status: "DRAFT",
    publishedAt: null,
    owner: { walletAddress: DAVE.toLowerCase() },
    task: { rewardPolicy: { id: "reward-1", type: "POINTS", configuration: { completerPoints: 30, referralPoolPoints: 10 } } },
    ...overrides,
  };
}

function storedFulfillment(overrides: Record<string, unknown> = {}) {
  return {
    id: FULFILLMENT_ID,
    status: "SUBMITTED",
    submissionTransactionHash: null,
    verifiedAt: null,
    rejectedAt: null,
    rewardTransactionHash: null,
    rejectionReason: null,
    participant: { walletAddress: ALICE.toLowerCase() },
    task: { campaignId: CAMPAIGN_ID, rewardPolicy: { type: "POINTS" } },
    ...overrides,
  };
}

// The data the first updateMany call wrote
const written = () => db.campaignFulfillment.updateMany.mock.calls[0][0].data;
// The updateMany calls that change the status
const statusWrites = () =>
  db.campaignFulfillment.updateMany.mock.calls.map(([call]: any[]) => call).filter((call: any) => "status" in call.data);

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (work: unknown[]) => Promise.all(work));
  db.campaign.updateMany.mockResolvedValue({ count: 1 });
  db.campaignFulfillment.updateMany.mockResolvedValue({ count: 1 });
  db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment());
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("CampaignCreated", () => {
  test("publishes the draft and stores the reward the chain will pay", async () => {
    db.campaign.findUnique.mockResolvedValue(storedCampaign());

    expect(await applyCampaignCreated(createdEvent())).toEqual({ outcome: "APPLIED", id: CAMPAIGN_ID });

    expect(db.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID, publishedAt: null },
      data: { publishedAt: expect.any(Date), publishTransactionHash: "0xcreated", status: "ACTIVE" },
    });
    expect(db.campaignRewardPolicy.update).toHaveBeenCalledWith({
      where: { id: "reward-1" },
      data: { configuration: { completerPoints: 30, referralPoolPoints: 10 } },
    });
  });

  test("a second delivery changes nothing", async () => {
    db.campaign.findUnique.mockResolvedValue(storedCampaign({ status: "ACTIVE", publishedAt: new Date() }));

    expect(await applyCampaignCreated(createdEvent())).toEqual({ outcome: "ALREADY_APPLIED", id: CAMPAIGN_ID });
    expect(db.campaign.updateMany).not.toHaveBeenCalled();
  });

  test("publishes a Direct draft with lossless chain reward and post-funding state", async () => {
    db.campaign.findUnique.mockResolvedValue(storedCampaign({
      task: { rewardPolicy: { id: "reward-1", type: "DIRECT", configuration: { initialFundingRuns: 10 } } },
    }));
    const chain = { getCampaign: jest.fn().mockResolvedValue({ balance: 40_000_000_000_000_000n, status: 1 }) };

    expect(await applyCampaignCreated(createdEvent({
      rewardType: 1,
      completerReward: 3_000_000_000_000_000n,
      referralPool: 1_000_000_000_000_000n,
    }), chain)).toEqual({ outcome: "APPLIED", id: CAMPAIGN_ID });

    expect(db.campaignRewardPolicy.update).toHaveBeenCalledWith({
      where: { id: "reward-1" },
      data: { configuration: {
        completerRewardWei: "3000000000000000",
        referralPoolWei: "1000000000000000",
        initialFundingRuns: 10,
      } },
    });
    expect(db.campaign.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({
      chainBalanceWei: "40000000000000000",
      chainStatus: "ACTIVE",
    }));
  });

  test("skips a creation event whose reward type differs from the saved draft", async () => {
    db.campaign.findUnique.mockResolvedValue(storedCampaign());
    expect((await applyCampaignCreated(createdEvent({ rewardType: 1 }), { getCampaign: jest.fn() })).outcome).toBe("SKIPPED");
  });

  test("a draft cancelled before its transaction was mined stays cancelled", async () => {
    db.campaign.findUnique.mockResolvedValue(storedCampaign({ status: "CANCELLED" }));

    await applyCampaignCreated(createdEvent());

    expect(db.campaign.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  test.each([
    ["a campaign the API never saved", null],
    ["the built-in campaign", storedCampaign({ isSystem: true, owner: null })],
    ["a campaign created on chain by someone other than its owner", storedCampaign({ owner: { walletAddress: BOB.toLowerCase() } })],
  ])("skips %s", async (_case, stored) => {
    db.campaign.findUnique.mockResolvedValue(stored);

    expect((await applyCampaignCreated(createdEvent())).outcome).toBe("SKIPPED");
    expect(db.campaign.updateMany).not.toHaveBeenCalled();
  });
});

describe("CampaignFulfillmentSubmitted", () => {
  const event = () => ({ ...submissionEvent(), taskType: 1, ...position("0xSUBMITTED", 11n, 0) });

  test("puts the submission under review, with the event that confirmed it", async () => {
    expect(await applyCampaignFulfillmentSubmitted(event())).toEqual({ outcome: "APPLIED", id: FULFILLMENT_ID });

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, submissionTransactionHash: null },
      data: {
        submissionTransactionHash: "0xsubmitted",
        submissionBlockNumber: 11n,
        submissionLogIndex: 0,
        submittedAt: expect.any(Date),
        status: "UNDER_REVIEW",
      },
    });
  });

  test("a second delivery changes nothing", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ submissionTransactionHash: "0xsubmitted" }));

    expect((await applyCampaignFulfillmentSubmitted(event())).outcome).toBe("ALREADY_APPLIED");
    expect(db.campaignFulfillment.updateMany).not.toHaveBeenCalled();
  });

  test("never moves a submission back when a later event was applied first", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "REWARDED" }));

    await applyCampaignFulfillmentSubmitted(event());

    expect(written()).not.toHaveProperty("status");
    expect(written().submissionTransactionHash).toBe("0xsubmitted");
  });

  test.each([
    ["a submission the API never saved", { fulfillment: null }],
    ["an event naming another campaign", { event: { campaignId: bytes32(OTHER_ID) } }],
    ["an event naming another participant", { event: { participant: BOB } }],
  ])("skips %s", async (_case, { fulfillment, event: overrides }: any) => {
    if (fulfillment === null) db.campaignFulfillment.findUnique.mockResolvedValue(null);

    const result = await applyCampaignFulfillmentSubmitted({ ...event(), ...overrides });

    expect(result.outcome).toBe("SKIPPED");
    expect(db.campaignFulfillment.updateMany).not.toHaveBeenCalled();
  });
});

describe("CampaignFulfillmentVerified", () => {
  const event = () => ({
    ...submissionEvent(),
    verifier: DAVE as `0x${string}`,
    verificationType: 1,
    ...position("0xDECIDED", 12n, 0),
  });

  test("makes the approval final", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "APPROVED" }));

    await applyCampaignFulfillmentVerified(event());

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, verifiedAt: null },
      data: {
        verificationTransactionHash: "0xdecided",
        verificationBlockNumber: 12n,
        verificationLogIndex: 0,
        verifiedAt: expect.any(Date),
        rejectionReason: null,
      },
    });
  });

  test("never overwrites a payout, even one saved after this event read the submission", async () => {
    // The read says APPROVED, but the payout event from the same transaction can be saved before the write lands
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "APPROVED" }));

    await applyCampaignFulfillmentVerified(event());

    expect(statusWrites()).toEqual([
      { where: { id: FULFILLMENT_ID, status: { not: "REWARDED" } }, data: { status: "APPROVED" } },
    ]);
  });

  test("the chain's approval wins over a rejection saved in the API", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(
      storedFulfillment({ status: "REJECTED", rejectionReason: "Wrong profile" }),
    );

    await applyCampaignFulfillmentVerified(event());

    expect(written()).toEqual(expect.objectContaining({ rejectionReason: null }));
    expect(statusWrites()[0].data).toEqual({ status: "APPROVED" });
    expect(console.warn).toHaveBeenCalled();
  });

  test("a second delivery changes nothing", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "REWARDED", verifiedAt: new Date() }));

    expect((await applyCampaignFulfillmentVerified(event())).outcome).toBe("ALREADY_APPLIED");
  });
});

describe("CampaignFulfillmentRejected", () => {
  const event = () => ({ ...submissionEvent(), verifier: DAVE as `0x${string}`, ...position("0xREJECTED", 13n, 2) });

  test("makes the rejection final and keeps the creator's reason", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(
      storedFulfillment({ status: "REJECTED", rejectionReason: "Wrong profile" }),
    );

    await applyCampaignFulfillmentRejected(event());

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, rejectedAt: null },
      data: {
        verificationTransactionHash: "0xrejected",
        verificationBlockNumber: 13n,
        verificationLogIndex: 2,
        rejectedAt: expect.any(Date),
        status: "REJECTED",
      },
    });
  });

  test("the chain's rejection wins over an approval saved in the API", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "APPROVED" }));

    await applyCampaignFulfillmentRejected(event());

    expect(written().status).toBe("REJECTED");
    expect(console.warn).toHaveBeenCalled();
  });

  test("a second delivery changes nothing", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "REJECTED", rejectedAt: new Date() }));

    expect((await applyCampaignFulfillmentRejected(event())).outcome).toBe("ALREADY_APPLIED");
  });
});

describe("CampaignRewardPaid", () => {
  const event = () => ({
    ...submissionEvent(),
    rewardType: 0,
    completerReward: 30n,
    referralPool: 10n,
    referralPayout: {
      directRecipient: BOB as `0x${string}`,
      grandparentRecipient: CAROL as `0x${string}`,
      directAmount: 8n,
      grandparentAmount: 2n,
      unallocatedAmount: 0n,
    },
    ...position("0xDECIDED", 12n, 4),
  });

  test("marks the submission rewarded and stores the payout as a campaign payout", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({ status: "APPROVED" }));

    expect(await applyCampaignRewardPaid(event())).toEqual({ outcome: "APPLIED", id: FULFILLMENT_ID });

    expect(db.campaignFulfillment.updateMany).toHaveBeenCalledWith({
      where: { id: FULFILLMENT_ID, rewardTransactionHash: null },
      data: {
        rewardTransactionHash: "0xdecided",
        rewardBlockNumber: 12n,
        rewardLogIndex: 4,
        rewardedAt: expect.any(Date),
        completerReward: 30,
        rejectionReason: null,
        status: "REWARDED",
      },
    });
    const allocation = {
      transactionHash: "0xdecided",
      logIndex: 4,
      blockNumber: 12n,
      participantWalletAddress: ALICE.toLowerCase(),
      pool: 10,
      directRecipientWalletAddress: BOB.toLowerCase(),
      directAmount: 8,
      grandparentRecipientWalletAddress: CAROL.toLowerCase(),
      grandparentAmount: 2,
      unallocatedAmount: 0,
      source: "campaign",
    };
    expect(db.referralPointAllocation.upsert).toHaveBeenCalledWith({
      where: { transactionHash_logIndex: { transactionHash: "0xdecided", logIndex: 4 } },
      update: allocation,
      create: allocation,
    });
  });

  test("stores Direct settlement as wei without touching points", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(storedFulfillment({
      status: "APPROVED",
      task: { campaignId: CAMPAIGN_ID, rewardPolicy: { type: "DIRECT" } },
    }));
    const chain = { getCampaign: jest.fn().mockResolvedValue({ balance: 100n, status: 3 }) };
    const directEvent = {
      ...event(),
      rewardType: 1,
      completerReward: 3000000000000000n,
      referralPool: 1000000000000000n,
      referralPayout: { ...event().referralPayout, directAmount: 800000000000000n, grandparentAmount: 200000000000000n },
    };

    expect(await applyCampaignRewardPaid(directEvent, chain)).toEqual({ outcome: "APPLIED", id: FULFILLMENT_ID });
    expect(db.referralPointAllocation.upsert).not.toHaveBeenCalled();
    expect(db.directCampaignSettlement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        completerAmountWei: "3000000000000000",
        referralPoolWei: "1000000000000000",
        directAmountWei: "800000000000000",
      }),
    }));
    expect(db.campaignFulfillment.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({
      completerRewardWei: "3000000000000000",
      status: "REWARDED",
    }));
    expect(db.campaign.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { chainBalanceWei: "100", chainStatus: "PENDING_FUNDING" },
    }));
  });

  test("a second delivery changes nothing", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(
      storedFulfillment({ status: "REWARDED", rewardTransactionHash: "0xdecided" }),
    );

    expect((await applyCampaignRewardPaid(event())).outcome).toBe("ALREADY_APPLIED");
    expect(db.referralPointAllocation.upsert).not.toHaveBeenCalled();
  });

  test("skips a payout for a submission the API never saved", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue(null);

    expect((await applyCampaignRewardPaid(event())).outcome).toBe("SKIPPED");
    expect(db.referralPointAllocation.upsert).not.toHaveBeenCalled();
  });
});

describe("Direct reward balance history", () => {
  test("projects accrual losslessly and idempotently", async () => {
    const event = {
      account: ALICE as `0x${string}`,
      amount: 3_000_000_000_000_000n,
      balance: 7_000_000_000_000_000n,
      ...position("0xACCRUED", 20n, 2),
    };
    expect((await applyDirectRewardAccrued(event)).outcome).toBe("APPLIED");
    expect(db.directRewardEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: "ACCRUED",
      account: ALICE.toLowerCase(),
      amountWei: "3000000000000000",
      balanceAfterWei: "7000000000000000",
    }) });
    db.directRewardEvent.findUnique.mockResolvedValue({ id: "existing" });
    expect((await applyDirectRewardAccrued(event)).outcome).toBe("ALREADY_APPLIED");
  });

  test("projects confirmed withdrawal with its destination", async () => {
    const event = {
      account: ALICE as `0x${string}`,
      destination: BOB as `0x${string}`,
      amount: 7_000_000_000_000_000n,
      ...position("0xWITHDRAWN", 21n, 0),
    };
    expect((await applyDirectRewardsWithdrawn(event)).outcome).toBe("APPLIED");
    expect(db.directRewardEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: "WITHDRAWN",
      account: ALICE.toLowerCase(),
      destination: BOB.toLowerCase(),
      amountWei: "7000000000000000",
      balanceAfterWei: "0",
    }) });
  });
});
