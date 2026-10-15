// Purpose: Verifies replay-safe built-in referral fulfillment projection from one successful receipt
// Notes: Uses real ABI event encoding/decoding and an in-memory Prisma fulfillment stand-in

import { RefferalABI } from "@reffinity/common-contracts";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { prisma } from "@/lib/prisma.js";
import { getBuiltinReferralCampaign } from "@/services/campaign.service.js";
import {
  CampaignFulfillmentProjectionError,
  getCurrentBuiltinReferralFulfillment,
  projectBuiltinReferralFulfillment,
  reconcileBuiltinReferralFulfillments,
  refreshBuiltinReferralFulfillment,
  refreshCurrentBuiltinReferralFulfillment,
  type CampaignFulfillmentReadClient,
} from "@/services/campaignFulfillment.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    referral: { findMany: jest.fn() },
    referralPointAllocation: { findMany: jest.fn() },
    campaignFulfillment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/services/campaign.service", () => ({
  getBuiltinReferralCampaign: jest.fn(),
}));
jest.mock("@reffinity/blockchain-connector/uuidBytesConverter", () => ({
  bytes32ToUuid: jest.fn(() => "referral-1"),
}), { virtual: true });

const db = prisma as any;
const mockGetCampaign = getBuiltinReferralCampaign as jest.Mock;

const CONTRACT = "0x1000000000000000000000000000000000000000" as Address;
const PARTICIPANT = "0x2000000000000000000000000000000000000000" as Address;
const DIRECT = "0x3000000000000000000000000000000000000000" as Address;
const GRANDPARENT = "0x4000000000000000000000000000000000000000" as Address;
const TRANSACTION_HASH = `0x${"ab".repeat(32)}` as Hash;
const INVITE_ID = `0x${"12".repeat(32)}` as Hex;
const BLOCK_NUMBER = 44n;
const BLOCK_TIMESTAMP = 1_800_000_000n;

type TestLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  logIndex: number;
};

function allocationLog(logIndex = 4): TestLog {
  return {
    address: CONTRACT,
    topics: encodeEventTopics({
      abi: RefferalABI,
      eventName: "ReferralPointsAllocated",
      args: {
        participant: PARTICIPANT,
        directRecipient: DIRECT,
        grandparentRecipient: GRANDPARENT,
      },
    }) as readonly Hex[],
    data: encodeAbiParameters(
      [
        { type: "uint256", name: "pool" },
        { type: "uint256", name: "directAmount" },
        { type: "uint256", name: "grandparentAmount" },
        { type: "uint256", name: "unallocatedAmount" },
      ],
      [100n, 80n, 20n, 0n],
    ),
    logIndex,
  };
}

function participantPointsLog(logIndex = 5): TestLog {
  return {
    address: CONTRACT,
    topics: encodeEventTopics({
      abi: RefferalABI,
      eventName: "PointsAdded",
      args: { user: PARTICIPANT },
    }) as readonly Hex[],
    data: encodeAbiParameters(
      [
        { type: "uint256", name: "points" },
        { type: "bool", name: "isPending" },
      ],
      [50n, false],
    ),
    logIndex,
  };
}

function acceptedInviteLog(
  logIndex = 6,
  referrer: Address = DIRECT,
): TestLog {
  return {
    address: CONTRACT,
    topics: encodeEventTopics({
      abi: RefferalABI,
      eventName: "InviteChanged",
      args: { inviteId: INVITE_ID, referrer },
    }) as readonly Hex[],
    data: encodeAbiParameters([{ type: "uint8", name: "status" }], [1]),
    logIndex,
  };
}

function receipt(logs: TestLog[] = [
  allocationLog(),
  participantPointsLog(),
  acceptedInviteLog(),
]) {
  return {
    status: "success" as const,
    transactionHash: TRANSACTION_HASH,
    blockNumber: BLOCK_NUMBER,
    to: CONTRACT,
    logs,
  };
}

function clientWith(logs?: TestLog[]): CampaignFulfillmentReadClient {
  return {
    getChainId: jest.fn().mockResolvedValue(31337),
    getTransactionReceipt: jest.fn().mockResolvedValue(receipt(logs)),
    getBlock: jest.fn().mockResolvedValue({ timestamp: BLOCK_TIMESTAMP }),
  };
}

function linkedReferral() {
  return {
    id: "referral-1",
    referee: { id: "participant-1", walletAddress: PARTICIPANT.toLowerCase() },
    referrer: { walletAddress: DIRECT.toLowerCase() },
  };
}

describe("projectBuiltinReferralFulfillment", () => {
  let stored: any;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = null;
    mockGetCampaign.mockResolvedValue({ task: { id: "task-1" } });
    db.referral.findMany.mockResolvedValue([linkedReferral()]);
    db.$transaction.mockImplementation(async (work: (tx: any) => unknown) => work(db));
    db.campaignFulfillment.findUniqueOrThrow.mockImplementation(() => {
      if (!stored) throw new Error("missing fulfillment");
      return Promise.resolve(stored);
    });
    db.campaignFulfillment.findUnique.mockImplementation(() => Promise.resolve(stored));
    db.campaignFulfillment.upsert.mockImplementation(({ create }: any) => {
      if (!stored) {
        stored = {
          id: "fulfillment-1",
          rewardTransactionHash: null,
          rewardBlockNumber: null,
          rewardLogIndex: null,
          rewardedAt: null,
          ...create,
        };
      }
      return Promise.resolve(stored);
    });
    db.campaignFulfillment.update.mockImplementation(({ data }: any) => {
      stored = { ...stored, ...data };
      return Promise.resolve(stored);
    });
  });

  test("commits VERIFIED and then REWARDED from one consistent receipt", async () => {
    const result = await projectBuiltinReferralFulfillment(clientWith(), {
      transactionHash: TRANSACTION_HASH,
      logIndex: 4,
    });

    expect(result).toEqual({
      outcome: "REWARDED",
      fulfillmentId: "fulfillment-1",
      referralId: "referral-1",
      participantId: "participant-1",
      transactionHash: TRANSACTION_HASH,
      replayed: false,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.campaignFulfillment.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: "builtin-referral:31337:referral-1:1" },
      update: {},
      create: expect.objectContaining({
        taskId: "task-1",
        participantId: "participant-1",
        referralId: "referral-1",
        attempt: 1,
        idempotencyKey: "builtin-referral:31337:referral-1:1",
        status: "VERIFIED",
        chainId: 31337,
        verificationTransactionHash: TRANSACTION_HASH,
        verificationBlockNumber: BLOCK_NUMBER,
        verificationLogIndex: 4,
        verifiedAt: new Date(Number(BLOCK_TIMESTAMP) * 1000),
      }),
    });
    expect(db.campaignFulfillment.update).toHaveBeenCalledWith({
      where: { id: "fulfillment-1" },
      data: {
        status: "REWARDED",
        rewardTransactionHash: TRANSACTION_HASH,
        rewardBlockNumber: BLOCK_NUMBER,
        rewardLogIndex: 5,
        rewardedAt: new Date(Number(BLOCK_TIMESTAMP) * 1000),
      },
    });
  });

  test.each([
    [[allocationLog(), acceptedInviteLog()], "missing participant points"],
    [[allocationLog(), participantPointsLog()], "missing accepted invite"],
  ])("keeps a durable VERIFIED fulfillment for %s", async (logs) => {
    const result = await projectBuiltinReferralFulfillment(clientWith(logs as TestLog[]), {
      transactionHash: TRANSACTION_HASH,
      logIndex: 4,
    });

    expect(result.outcome).toBe("VERIFIED");
    expect(stored.status).toBe("VERIFIED");
    expect(stored.rewardTransactionHash).toBeNull();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  test("defers without creating a fulfillment when the existing referral link is missing", async () => {
    db.referral.findMany.mockResolvedValue([]);

    await expect(
      projectBuiltinReferralFulfillment(clientWith(), {
        transactionHash: TRANSACTION_HASH,
        logIndex: 4,
      }),
    ).resolves.toEqual({
      outcome: "DEFERRED",
      reason: "REFERRAL_NOT_FOUND",
      transactionHash: TRANSACTION_HASH,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockGetCampaign).not.toHaveBeenCalled();
  });

  test("replay returns the existing REWARDED fulfillment without duplicate writes", async () => {
    const projection = {
      transactionHash: TRANSACTION_HASH,
      logIndex: 4,
    } as const;
    await projectBuiltinReferralFulfillment(clientWith(), projection);
    jest.clearAllMocks();
    db.referral.findMany.mockResolvedValue([linkedReferral()]);
    db.$transaction.mockImplementation(async (work: (tx: any) => unknown) => work(db));
    db.campaignFulfillment.findUniqueOrThrow.mockImplementation(() => Promise.resolve(stored));
    mockGetCampaign.mockResolvedValue({ task: { id: "task-1" } });

    const result = await projectBuiltinReferralFulfillment(clientWith(), projection);

    expect(result.outcome).toBe("REWARDED");
    expect(result).toEqual(expect.objectContaining({ replayed: true }));
    expect(db.campaignFulfillment.upsert).toHaveBeenCalledTimes(1);
    expect(db.campaignFulfillment.update).not.toHaveBeenCalled();
  });

  test("a later replay advances a half-complete VERIFIED fulfillment to REWARDED", async () => {
    const projection = {
      transactionHash: TRANSACTION_HASH,
      logIndex: 4,
    } as const;
    const partial = await projectBuiltinReferralFulfillment(
      clientWith([allocationLog(), acceptedInviteLog()]),
      projection,
    );
    expect(partial.outcome).toBe("VERIFIED");
    expect(stored.rewardTransactionHash).toBeNull();

    const recovered = await projectBuiltinReferralFulfillment(clientWith(), projection);

    expect(recovered.outcome).toBe("REWARDED");
    expect(stored.status).toBe("REWARDED");
    expect(stored.rewardLogIndex).toBe(5);
    expect(db.campaignFulfillment.upsert).toHaveBeenCalledTimes(2);
  });

  test("preserves VERIFIED before rejecting conflicting invite evidence", async () => {
    const wrongReferrer = "0x5000000000000000000000000000000000000000" as Address;

    await expect(
      projectBuiltinReferralFulfillment(
        clientWith([
          allocationLog(),
          participantPointsLog(),
          acceptedInviteLog(6, wrongReferrer),
        ]),
        { transactionHash: TRANSACTION_HASH, logIndex: 4 },
      ),
    ).rejects.toMatchObject<Partial<CampaignFulfillmentProjectionError>>({
      code: "EVENT_CONFLICT",
    });
    expect(stored.status).toBe("VERIFIED");
    expect(stored.rewardTransactionHash).toBeNull();
  });

  test("rejects an existing fulfillment with a different verification identity", async () => {
    stored = {
      id: "fulfillment-1",
      taskId: "task-1",
      participantId: "participant-1",
      referralId: "referral-1",
      chainId: 31337,
      status: "VERIFIED",
      verificationTransactionHash: `0x${"cd".repeat(32)}`,
      verificationBlockNumber: BLOCK_NUMBER,
      verificationLogIndex: 4,
      rewardTransactionHash: null,
      rewardBlockNumber: null,
      rewardLogIndex: null,
    };

    await expect(
      projectBuiltinReferralFulfillment(clientWith(), {
        transactionHash: TRANSACTION_HASH,
        logIndex: 4,
      }),
    ).rejects.toMatchObject<Partial<CampaignFulfillmentProjectionError>>({
      code: "FULFILLMENT_CONFLICT",
    });
    expect(db.campaignFulfillment.update).not.toHaveBeenCalled();
  });

  test("rejects ambiguous existing referral links", async () => {
    db.referral.findMany.mockResolvedValue([linkedReferral(), linkedReferral()]);

    await expect(
      projectBuiltinReferralFulfillment(clientWith(), {
        transactionHash: TRANSACTION_HASH,
        logIndex: 4,
      }),
    ).rejects.toMatchObject<Partial<CampaignFulfillmentProjectionError>>({
      code: "AMBIGUOUS_REFERRAL",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test("rejects a reverted receipt and a missing allocation anchor", async () => {
    const revertedClient = clientWith() as any;
    revertedClient.getTransactionReceipt.mockResolvedValue({
      ...receipt(),
      status: "reverted",
    });
    await expect(
      projectBuiltinReferralFulfillment(revertedClient, {
        transactionHash: TRANSACTION_HASH,
        logIndex: 4,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RECEIPT" });

    await expect(
      projectBuiltinReferralFulfillment(clientWith(), {
        transactionHash: TRANSACTION_HASH,
        logIndex: 99,
      }),
    ).rejects.toMatchObject({ code: "MISSING_ALLOCATION_EVENT" });
  });
});

describe("built-in fulfillment recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("scans durable allocations in bounded pages through the shared projector", async () => {
    db.referralPointAllocation.findMany
      .mockResolvedValueOnce([
        { id: "allocation-1", transactionHash: TRANSACTION_HASH, logIndex: 4 },
        { id: "allocation-2", transactionHash: TRANSACTION_HASH, logIndex: 5 },
      ])
      .mockResolvedValueOnce([
        { id: "allocation-3", transactionHash: TRANSACTION_HASH, logIndex: 6 },
      ]);
    const projector = jest
      .fn()
      .mockResolvedValueOnce({
        outcome: "REWARDED",
        fulfillmentId: "fulfillment-1",
        referralId: "referral-1",
        participantId: "participant-1",
        transactionHash: TRANSACTION_HASH,
        replayed: true,
      })
      .mockResolvedValueOnce({
        outcome: "VERIFIED",
        fulfillmentId: "fulfillment-2",
        referralId: "referral-2",
        participantId: "participant-2",
        transactionHash: TRANSACTION_HASH,
        replayed: false,
      })
      .mockResolvedValueOnce({
        outcome: "DEFERRED",
        reason: "REFERRAL_NOT_FOUND",
        transactionHash: TRANSACTION_HASH,
      });

    await expect(
      reconcileBuiltinReferralFulfillments(clientWith(), {
        batchSize: 2,
        projector,
      }),
    ).resolves.toEqual({
      scanned: 3,
      rewarded: 1,
      verified: 1,
      deferred: 1,
      replayed: 1,
      legacy: 0,
      failed: 0,
    });
    expect(db.referralPointAllocation.findMany).toHaveBeenNthCalledWith(2, {
      orderBy: { id: "asc" },
      take: 2,
      cursor: { id: "allocation-2" },
      skip: 1,
      select: { id: true, transactionHash: true, logIndex: true },
    });
    expect(projector).toHaveBeenCalledTimes(3);
  });

  test("reports legacy and malformed rows without stopping later recovery", async () => {
    const invalidHash = "0xold-import";
    db.referralPointAllocation.findMany.mockResolvedValueOnce([
      { id: "legacy", transactionHash: TRANSACTION_HASH, logIndex: 3 },
      { id: "malformed", transactionHash: invalidHash, logIndex: 4 },
    ]);
    const projector = jest.fn().mockRejectedValue(
      new CampaignFulfillmentProjectionError(
        "MISSING_ALLOCATION_EVENT",
        "receipt predates compatible evidence",
      ),
    );
    const onIssue = jest.fn();

    await expect(
      reconcileBuiltinReferralFulfillments(clientWith(), {
        projector,
        onIssue,
      }),
    ).resolves.toEqual({
      scanned: 2,
      rewarded: 0,
      verified: 0,
      deferred: 0,
      replayed: 0,
      legacy: 1,
      failed: 1,
    });
    expect(onIssue).toHaveBeenCalledWith(
      expect.objectContaining({ allocationId: "legacy", code: "MISSING_ALLOCATION_EVENT" }),
    );
    expect(onIssue).toHaveBeenCalledWith(
      expect.objectContaining({ allocationId: "malformed", code: "INVALID_TRANSACTION_HASH" }),
    );
  });

  test("refreshes one fulfillment from its stored verification anchor", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue({
      verificationTransactionHash: TRANSACTION_HASH,
      verificationLogIndex: 4,
    });
    const result = {
      outcome: "VERIFIED" as const,
      fulfillmentId: "fulfillment-1",
      referralId: "referral-1",
      participantId: "participant-1",
      transactionHash: TRANSACTION_HASH,
      replayed: true,
    };
    const projector = jest.fn().mockResolvedValue(result);

    await expect(
      refreshBuiltinReferralFulfillment(clientWith(), "fulfillment-1", projector),
    ).resolves.toEqual(result);
    expect(projector).toHaveBeenCalledWith(expect.anything(), {
      transactionHash: TRANSACTION_HASH,
      logIndex: 4,
    });
  });

  test("does not fabricate an anchor for an unverified fulfillment", async () => {
    db.campaignFulfillment.findUnique.mockResolvedValue({
      verificationTransactionHash: null,
      verificationLogIndex: null,
    });
    const projector = jest.fn();

    await expect(
      refreshBuiltinReferralFulfillment(clientWith(), "fulfillment-1", projector),
    ).resolves.toBeNull();
    expect(projector).not.toHaveBeenCalled();
  });

  test("loads only the current participant's latest task attempt", async () => {
    db.campaignFulfillment.findFirst.mockResolvedValue(null);

    await expect(
      getCurrentBuiltinReferralFulfillment("task-1", "participant-1"),
    ).resolves.toBeNull();
    expect(db.campaignFulfillment.findFirst).toHaveBeenCalledWith({
      where: { taskId: "task-1", participantId: "participant-1" },
      orderBy: { attempt: "desc" },
      select: expect.objectContaining({
        id: true,
        status: true,
        verificationTransactionHash: true,
        rewardTransactionHash: true,
      }),
    });
  });

  test("returns the latest durable VERIFIED row when read-through recovery fails", async () => {
    const verified = {
      id: "fulfillment-1",
      taskId: "task-1",
      participantId: "participant-1",
      referralId: "referral-1",
      attempt: 1,
      status: "VERIFIED" as const,
      chainId: 31337,
      verificationTransactionHash: TRANSACTION_HASH,
      verificationBlockNumber: BLOCK_NUMBER,
      verificationLogIndex: 4,
      rewardTransactionHash: null,
      rewardBlockNumber: null,
      rewardLogIndex: null,
      verifiedAt: new Date(),
      rewardedAt: null,
    };
    db.campaignFulfillment.findUnique
      .mockResolvedValueOnce({
        verificationTransactionHash: TRANSACTION_HASH,
        verificationLogIndex: 4,
      })
      .mockResolvedValueOnce(verified);
    const client = clientWith() as any;
    client.getTransactionReceipt.mockRejectedValue(new Error("provider offline"));
    const onRefreshError = jest.fn();

    await expect(
      refreshCurrentBuiltinReferralFulfillment(
        client,
        verified,
        onRefreshError,
      ),
    ).resolves.toEqual(verified);
    expect(onRefreshError).toHaveBeenCalledWith(expect.any(Error));
  });

  test("does not read the chain again after a fulfillment is already REWARDED", async () => {
    const rewarded = {
      id: "fulfillment-1",
      taskId: "task-1",
      participantId: "participant-1",
      referralId: "referral-1",
      attempt: 1,
      status: "REWARDED" as const,
      chainId: 31337,
      verificationTransactionHash: TRANSACTION_HASH,
      verificationBlockNumber: BLOCK_NUMBER,
      verificationLogIndex: 4,
      rewardTransactionHash: TRANSACTION_HASH,
      rewardBlockNumber: BLOCK_NUMBER,
      rewardLogIndex: 5,
      verifiedAt: new Date(),
      rewardedAt: new Date(),
    };
    const client = clientWith();

    await expect(
      refreshCurrentBuiltinReferralFulfillment(client, rewarded),
    ).resolves.toBe(rewarded);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
    expect(db.campaignFulfillment.findUnique).not.toHaveBeenCalled();
  });
});
