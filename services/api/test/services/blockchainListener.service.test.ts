// Purpose: Unit tests for the blockchain listener, which turns contract events into database updates
// Notes:
// - Mocks Prisma and the blockchain connector, then feeds events to the handlers the listener registers
// - Covers live events (PointsAdded, InviteChanged, ReferralPointsAllocated), catch-up, and stopping

import { BlockchainListenerService } from "@/services/blockchainListener.service.js";
import { prisma } from "@/lib/prisma.js";
import { bytes32ToUuid } from "@reffinity/blockchain-connector/uuidBytesConverter";

// Stand-ins for the viem client and the connector service the listener creates
const mockPublicClient = {
  getChainId: jest.fn(),
  getBlockNumber: jest.fn(),
};
const mockReadService = {
  listenToPointsAddedEvent: jest.fn(),
  listenToInviteChangedEvent: jest.fn(),
  listenToReferralPointsAllocatedEvent: jest.fn(),
  getUserCurrentMilestone: jest.fn(),
  getPointsAddedEvents: jest.fn(),
  getInviteChangedEvents: jest.fn(),
  getReferralPointsAllocatedEvents: jest.fn(),
  stopListeningToPointsAddedEvent: jest.fn(),
  stopListeningToInviteChangedEvent: jest.fn(),
  stopListeningToReferralPointsAllocatedEvent: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    referral: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    referralPointAllocation: { upsert: jest.fn() },
    chainSyncState: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock(
  "@reffinity/blockchain-connector/clients",
  () => ({
    createClient: () => ({ publicClient: mockPublicClient }),
    createWebSocketClient: () => ({ publicClient: mockPublicClient }),
  }),
  { virtual: true },
);
jest.mock(
  "@reffinity/blockchain-connector/readReferralContract",
  () => ({ ReadReferralContractService: jest.fn(() => mockReadService) }),
  { virtual: true },
);
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({ bytes32ToUuid: jest.fn(() => "invite-uuid") }),
  { virtual: true },
);

// The mocked Prisma client, untyped so tests can set return values freely
const db = prisma as any;

// A user row as the listener finds it in the database
function savedUser(overrides = {}) {
  return {
    id: "user1",
    walletAddress: "0xabc",
    earnedPoints: 0,
    pendingPoints: 0,
    milestoneLevel: 0,
    ...overrides,
  };
}

// A live PointsAdded event as the connector passes it to the listener
function pointsEvent(overrides = {}) {
  return {
    user: "0xABC",
    points: 100n,
    isPending: false,
    blockNumber: 101n,
    logIndex: 3,
    ...overrides,
  };
}

// Starts a listener and returns the event handlers it registered
async function startListener() {
  const listener = new BlockchainListenerService();
  await listener.initialize();
  return {
    listener,
    onPointsAdded: mockReadService.listenToPointsAddedEvent.mock.calls[0][0],
    onInviteChanged: mockReadService.listenToInviteChangedEvent.mock.calls[0][0],
    onReferralPointsAllocated:
      mockReadService.listenToReferralPointsAllocatedEvent.mock.calls[0][0],
  };
}

describe("BlockchainListenerService", () => {
  const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockPublicClient.getChainId.mockReset().mockResolvedValue(31337);
    mockPublicClient.getBlockNumber.mockReset().mockResolvedValue(100n);
    mockReadService.listenToPointsAddedEvent.mockReset().mockResolvedValue(undefined);
    mockReadService.listenToInviteChangedEvent.mockReset().mockResolvedValue(undefined);
    mockReadService.listenToReferralPointsAllocatedEvent.mockReset().mockResolvedValue(undefined);
    mockReadService.getUserCurrentMilestone.mockReset().mockResolvedValue(2n);
    mockReadService.getPointsAddedEvents.mockReset().mockResolvedValue([]);
    mockReadService.getInviteChangedEvents.mockReset().mockResolvedValue([]);
    mockReadService.getReferralPointsAllocatedEvents.mockReset().mockResolvedValue([]);
    mockReadService.stopListeningToPointsAddedEvent.mockReset();
    mockReadService.stopListeningToInviteChangedEvent.mockReset();
    mockReadService.stopListeningToReferralPointsAllocatedEvent.mockReset();
    db.user.findUnique.mockReset().mockResolvedValue(savedUser());
    db.user.update.mockReset().mockResolvedValue({});
    db.referral.findFirst.mockReset().mockResolvedValue({ id: "ref1" });
    db.referral.update.mockReset().mockResolvedValue({});
    db.referral.updateMany.mockReset().mockResolvedValue({ count: 1 });
    db.referralPointAllocation.upsert.mockReset().mockResolvedValue({});
    db.chainSyncState.upsert.mockReset().mockResolvedValue({});
    // Already up to date with the chain unless a test says otherwise
    db.chainSyncState.findUnique
      .mockReset()
      .mockResolvedValue({
        id: 1,
        lastProcessedBlock: 100n,
        lastProcessedLogIndex: 0,
        lastReferralAllocationBlock: 100n,
        lastReferralAllocationLogIndex: -1,
      });
  });

  afterAll(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  describe("startup", () => {
    test("catches up with the chain, then starts all event listeners", async () => {
      await startListener();

      expect(mockPublicClient.getBlockNumber).toHaveBeenCalled();
      expect(mockReadService.listenToPointsAddedEvent).toHaveBeenCalledWith(
        expect.any(Function),
        10000,
      );
      expect(mockReadService.listenToInviteChangedEvent).toHaveBeenCalledWith(
        expect.any(Function),
        10000,
      );
      expect(
        mockReadService.listenToReferralPointsAllocatedEvent,
      ).toHaveBeenCalledWith(expect.any(Function), 10000);
    });

    test("does not register the listeners twice", async () => {
      const { listener } = await startListener();

      await listener.initialize();

      expect(mockReadService.listenToPointsAddedEvent).toHaveBeenCalledTimes(1);
      expect(mockReadService.listenToInviteChangedEvent).toHaveBeenCalledTimes(1);
      expect(
        mockReadService.listenToReferralPointsAllocatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    test("logs startup errors instead of crashing the API", async () => {
      mockPublicClient.getChainId.mockRejectedValue(new Error("node offline"));

      await expect(new BlockchainListenerService().initialize()).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalledWith(
        "Error initializing blockchain listener:",
        expect.any(Error),
      );
      expect(mockReadService.listenToPointsAddedEvent).not.toHaveBeenCalled();
    });

    test.each([
      "listenToPointsAddedEvent",
      "listenToInviteChangedEvent",
      "listenToReferralPointsAllocatedEvent",
    ] as const)(
      "reports a clear error when %s cannot start",
      async (method) => {
        mockReadService[method].mockRejectedValue(new Error("socket closed"));

        await new BlockchainListenerService().initialize();

        expect(consoleError).toHaveBeenCalledWith(
          "Error initializing blockchain listener:",
          expect.objectContaining({
            message: "Could not start blockchain listener: socket closed",
          }),
        );
      },
    );
  });

  describe("ReferralPointsAllocated events", () => {
    const allocationEvent = {
      participant: "0xPARTICIPANT",
      pool: 100n,
      directRecipient: "0xDIRECT",
      directAmount: 80n,
      grandparentRecipient: "0xGRANDPARENT",
      grandparentAmount: 20n,
      unallocatedAmount: 0n,
      blockNumber: 103n,
      logIndex: 4,
      transactionHash: "0xABCDEF",
    };

    test("persists an allocation idempotently and records its chain position", async () => {
      const { onReferralPointsAllocated } = await startListener();

      await onReferralPointsAllocated(allocationEvent);

      const data = {
        transactionHash: "0xabcdef",
        logIndex: 4,
        blockNumber: 103n,
        participantWalletAddress: "0xparticipant",
        pool: 100,
        directRecipientWalletAddress: "0xdirect",
        directAmount: 80,
        grandparentRecipientWalletAddress: "0xgrandparent",
        grandparentAmount: 20,
        unallocatedAmount: 0,
      };
      expect(db.referralPointAllocation.upsert).toHaveBeenCalledWith({
        where: {
          transactionHash_logIndex: {
            transactionHash: "0xabcdef",
            logIndex: 4,
          },
        },
        update: data,
        create: data,
      });
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: {
          lastReferralAllocationBlock: 103n,
          lastReferralAllocationLogIndex: 4,
        },
        create: {
          id: 1,
          lastProcessedBlock: 0n,
          lastProcessedLogIndex: 0,
          lastReferralAllocationBlock: 103n,
          lastReferralAllocationLogIndex: 4,
        },
      });
    });
  });

  describe("PointsAdded events", () => {
    test("saves earned points and the chain milestone, and credits the latest accepted referral", async () => {
      const { onPointsAdded } = await startListener();
      mockReadService.getUserCurrentMilestone.mockResolvedValue(1n);

      await onPointsAdded(pointsEvent());

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { walletAddress: "0xabc" },
      });
      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xabc" },
        data: { earnedPoints: 100, milestoneLevel: 1 },
      });
      expect(db.referral.findFirst).toHaveBeenCalledWith({
        where: { referrerId: "user1", status: 1, points: 0 },
        orderBy: { updatedAt: "desc" },
      });
      expect(db.referral.update).toHaveBeenCalledWith({
        where: { id: "ref1" },
        data: { points: 100 },
      });
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastProcessedBlock: 101n, lastProcessedLogIndex: 3 },
        create: { id: 1, lastProcessedBlock: 101n, lastProcessedLogIndex: 3 },
      });
    });

    test("gives the referral only the newly earned points", async () => {
      const { onPointsAdded } = await startListener();
      db.user.findUnique.mockResolvedValue(savedUser({ earnedPoints: 100 }));

      await onPointsAdded(pointsEvent({ points: 180n }));

      expect(db.referral.update).toHaveBeenCalledWith({
        where: { id: "ref1" },
        data: { points: 80 },
      });
    });

    test("saves pending points and credits the latest pending referral", async () => {
      const { onPointsAdded } = await startListener();

      await onPointsAdded(pointsEvent({ isPending: true }));

      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xabc" },
        data: { pendingPoints: 100, milestoneLevel: 2 },
      });
      expect(db.referral.findFirst).toHaveBeenCalledWith({
        where: { referrerId: "user1", status: 0, points: 0 },
        orderBy: { createdAt: "desc" },
      });
      expect(db.referral.update).toHaveBeenCalledWith({
        where: { id: "ref1" },
        data: { points: 100 },
      });
    });

    test.each([
      ["earned", false, { earnedPoints: 100 }],
      ["pending", true, { pendingPoints: 100 }],
    ])("leaves referrals alone when %s points did not go up", async (_label, isPending, saved) => {
      const { onPointsAdded } = await startListener();
      db.user.findUnique.mockResolvedValue(savedUser(saved));

      await onPointsAdded(pointsEvent({ isPending }));

      expect(db.user.update).toHaveBeenCalled();
      expect(db.referral.findFirst).not.toHaveBeenCalled();
    });

    test.each([false, true])(
      "does not change referrals when none is waiting for points (pending: %s)",
      async (isPending) => {
        const { onPointsAdded } = await startListener();
        db.referral.findFirst.mockResolvedValue(null);

        await onPointsAdded(pointsEvent({ isPending }));

        expect(db.referral.update).not.toHaveBeenCalled();
      },
    );

    test("keeps the saved milestone when the chain read fails", async () => {
      const { onPointsAdded } = await startListener();
      db.user.findUnique.mockResolvedValue(savedUser({ milestoneLevel: 3 }));
      mockReadService.getUserCurrentMilestone.mockRejectedValue(new Error("rpc error"));

      await onPointsAdded(pointsEvent());

      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xabc" },
        data: { earnedPoints: 100, milestoneLevel: 3 },
      });
      expect(consoleWarn).toHaveBeenCalled();
    });

    test("skips users that are not in the database but still records the block", async () => {
      const { onPointsAdded } = await startListener();
      db.user.findUnique.mockResolvedValue(null);

      await onPointsAdded(pointsEvent());

      expect(db.user.update).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        "User 0xabc not found in DB, skipping points update",
      );
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { lastProcessedBlock: 101n, lastProcessedLogIndex: 3 },
        }),
      );
    });
  });

  describe("InviteChanged events", () => {
    const inviteEvent = {
      inviteId: "0xinvite",
      status: 1,
      referrer: "0xREF",
      blockNumber: 102n,
      logIndex: 0,
    };

    test("marks the invite verified with its new status", async () => {
      const { onInviteChanged } = await startListener();

      await onInviteChanged(inviteEvent);

      expect(bytes32ToUuid).toHaveBeenCalledWith("0xinvite");
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid" },
        data: { status: 1, isVerified: true },
      });
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastProcessedBlock: 102n, lastProcessedLogIndex: 0 },
        create: { id: 1, lastProcessedBlock: 102n, lastProcessedLogIndex: 0 },
      });
    });

    test("still records the block when the invite update fails", async () => {
      const { onInviteChanged } = await startListener();
      const error = new Error("db down");
      db.referral.updateMany.mockRejectedValue(error);

      await onInviteChanged(inviteEvent);

      expect(consoleError).toHaveBeenCalledWith("Failed to update invite 0xinvite", error);
      expect(db.chainSyncState.upsert).toHaveBeenCalled();
    });
  });

  describe("catching up on startup", () => {
    // Past events as getContractEvents returns them
    const pastPoints = (blockNumber: bigint, logIndex: number, user: string, points: bigint, isPending = false) => ({
      blockNumber,
      logIndex,
      args: { user, points, isPending },
    });

    beforeEach(() => {
      db.chainSyncState.findUnique.mockResolvedValue({
        id: 1,
        lastProcessedBlock: 10n,
        lastProcessedLogIndex: 1,
      });
      mockPublicClient.getBlockNumber.mockResolvedValue(20n);
    });

    test("starts from block 0 when nothing has been synced yet", async () => {
      db.chainSyncState.findUnique.mockResolvedValue(null);

      await startListener();

      expect(mockReadService.getPointsAddedEvents).toHaveBeenCalledWith({ fromBlock: 0n, toBlock: 20n });
      expect(mockReadService.getInviteChangedEvents).toHaveBeenCalledWith({ fromBlock: 0n, toBlock: 20n });
      expect(mockReadService.getReferralPointsAllocatedEvents).toHaveBeenCalledWith({ fromBlock: 0n, toBlock: 20n });
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastProcessedBlock: 0n, lastProcessedLogIndex: 0 },
        create: { id: 1, lastProcessedBlock: 0n, lastProcessedLogIndex: 0 },
      });
    });

    test("skips the catch-up when the database is already up to date", async () => {
      db.chainSyncState.findUnique.mockResolvedValue({
        id: 1,
        lastProcessedBlock: 20n,
        lastProcessedLogIndex: 0,
        lastReferralAllocationBlock: 20n,
        lastReferralAllocationLogIndex: -1,
      });

      await startListener();

      expect(mockReadService.getPointsAddedEvents).not.toHaveBeenCalled();
      expect(mockReadService.getReferralPointsAllocatedEvents).not.toHaveBeenCalled();
      expect(db.chainSyncState.upsert).not.toHaveBeenCalled();
    });

    test("replays allocation history during catch-up", async () => {
      mockReadService.getReferralPointsAllocatedEvents.mockResolvedValue([
        {
          blockNumber: 12n,
          logIndex: 2,
          transactionHash: "0xCATCHUP",
          args: {
            participant: "0xCHILD",
            pool: 100n,
            directRecipient: "0xPARENT",
            directAmount: 80n,
            grandparentRecipient: "0xGRANDPARENT",
            grandparentAmount: 20n,
            unallocatedAmount: 0n,
          },
        },
      ]);

      await startListener();

      expect(db.referralPointAllocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            transactionHash_logIndex: {
              transactionHash: "0xcatchup",
              logIndex: 2,
            },
          },
          create: expect.objectContaining({
            participantWalletAddress: "0xchild",
            grandparentRecipientWalletAddress: "0xgrandparent",
            grandparentAmount: 20,
          }),
        }),
      );
    });

    test("replays missed events in chain order and skips ones already processed", async () => {
      mockReadService.getPointsAddedEvents.mockResolvedValue([
        pastPoints(12n, 4, "0xBBB", 50n),
        pastPoints(12n, 0, "0xAAA", 100n),
        pastPoints(10n, 1, "0xOLD", 999n), // same block and log index as the saved state
        pastPoints(9n, 0, "0xOLDER", 999n), // before the saved state
      ]);
      mockReadService.getInviteChangedEvents.mockResolvedValue([
        { blockNumber: 11n, logIndex: 5, args: { inviteId: "0xinvite", referrer: "0xAAA", status: 1 } },
      ]);

      await startListener();

      const updatedWallets = db.user.update.mock.calls.map(([call]: any) => call.where.walletAddress);
      expect(updatedWallets).toEqual(["0xaaa", "0xbbb"]);
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid" },
        data: { status: 1, isVerified: true },
      });
      expect(db.referral.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        db.user.update.mock.invocationCallOrder[0],
      );
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastProcessedBlock: 12n, lastProcessedLogIndex: 4 },
        create: { id: 1, lastProcessedBlock: 12n, lastProcessedLogIndex: 4 },
      });
    });

    test("credits pending points while catching up", async () => {
      db.user.findUnique.mockResolvedValue(savedUser({ pendingPoints: 10 }));
      mockReadService.getPointsAddedEvents.mockResolvedValue([pastPoints(12n, 0, "0xAAA", 40n, true)]);

      await startListener();

      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xaaa" },
        data: { pendingPoints: 40, milestoneLevel: 2 },
      });
      expect(db.referral.findFirst).toHaveBeenCalledWith({
        where: { referrerId: "user1", status: 0, points: 0 },
        orderBy: { createdAt: "desc" },
      });
      expect(db.referral.update).toHaveBeenCalledWith({
        where: { id: "ref1" },
        data: { points: 30 },
      });
    });

    test("keeps going past unknown users and failed milestone reads", async () => {
      db.user.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.walletAddress === "0xnew" ? null : savedUser({ milestoneLevel: 3 })),
      );
      mockReadService.getUserCurrentMilestone.mockRejectedValue(new Error("rpc error"));
      mockReadService.getPointsAddedEvents.mockResolvedValue([
        pastPoints(12n, 0, "0xNEW", 100n),
        pastPoints(13n, 0, "0xAAA", 100n),
      ]);

      await startListener();

      expect(db.user.update).toHaveBeenCalledTimes(1);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xaaa" },
        data: { earnedPoints: 100, milestoneLevel: 3 },
      });
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { lastProcessedBlock: 13n, lastProcessedLogIndex: 0 },
        }),
      );
    });

    test("leaves referrals alone when there is nothing to credit", async () => {
      db.user.findUnique.mockResolvedValue(savedUser({ earnedPoints: 100, pendingPoints: 50 }));
      db.referral.findFirst.mockResolvedValue(null);
      mockReadService.getPointsAddedEvents.mockResolvedValue([
        pastPoints(12n, 0, "0xAAA", 100n), // earned points unchanged
        pastPoints(12n, 1, "0xAAA", 50n, true), // pending points unchanged
        pastPoints(12n, 2, "0xAAA", 150n), // earned went up, but no referral is waiting
        pastPoints(12n, 3, "0xAAA", 80n, true), // pending went up, but no referral is waiting
      ]);

      await startListener();

      expect(db.user.update).toHaveBeenCalledTimes(4);
      expect(db.referral.findFirst).toHaveBeenCalledTimes(2);
      expect(db.referral.update).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    test("stops watching all events, only once", async () => {
      const { listener } = await startListener();

      listener.stop();
      listener.stop();

      expect(mockReadService.stopListeningToPointsAddedEvent).toHaveBeenCalledTimes(1);
      expect(mockReadService.stopListeningToInviteChangedEvent).toHaveBeenCalledTimes(1);
      expect(
        mockReadService.stopListeningToReferralPointsAllocatedEvent,
      ).toHaveBeenCalledTimes(1);
    });

    test("can start listening again after stopping", async () => {
      const { listener } = await startListener();

      listener.stop();
      await listener.initialize();

      expect(mockReadService.listenToPointsAddedEvent).toHaveBeenCalledTimes(2);
      expect(mockReadService.listenToInviteChangedEvent).toHaveBeenCalledTimes(2);
      expect(
        mockReadService.listenToReferralPointsAllocatedEvent,
      ).toHaveBeenCalledTimes(2);
    });

    test("does nothing if the listener never started", () => {
      new BlockchainListenerService().stop();

      expect(mockReadService.stopListeningToPointsAddedEvent).not.toHaveBeenCalled();
      expect(mockReadService.stopListeningToInviteChangedEvent).not.toHaveBeenCalled();
      expect(
        mockReadService.stopListeningToReferralPointsAllocatedEvent,
      ).not.toHaveBeenCalled();
    });
  });
});
