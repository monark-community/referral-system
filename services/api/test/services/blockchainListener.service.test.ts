// Purpose: Unit tests for the blockchain listener, which turns contract events into database updates
// Notes:
// - Mocks Prisma and the blockchain connector, then feeds events to the handlers the listener registers
// - Covers live events (PointsAdded, InviteChanged, ReferralPointsAllocated), catch-up, and stopping
// - "per-invite points" replays whole two-level sign-ups against an in-memory database, to check
//   which invite each share of the pool ends up on

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
  getReferralPointPool: jest.fn(),
  getGrandparentReferralBps: jest.fn(),
  getReferrers: jest.fn(),
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
    // The deployed settings: a 100-point pool split 80/20, and no referrer above the inviter
    mockReadService.getReferralPointPool.mockReset().mockResolvedValue(100n);
    mockReadService.getGrandparentReferralBps.mockReset().mockResolvedValue(2000);
    mockReadService.getReferrers.mockReset().mockResolvedValue(ZERO_ADDRESS);
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

    test("puts the direct share on the invite between the direct recipient and the new user", async () => {
      const { onReferralPointsAllocated } = await startListener();

      await onReferralPointsAllocated(allocationEvent);

      expect(db.referral.updateMany).toHaveBeenCalledTimes(1);
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: {
          referrer: { walletAddress: "0xdirect" },
          referee: { walletAddress: "0xparticipant" },
        },
        data: { points: 80 },
      });
    });

    test("leaves invites alone when nothing went to a direct recipient", async () => {
      const { onReferralPointsAllocated } = await startListener();

      await onReferralPointsAllocated({
        ...allocationEvent,
        directRecipient: ZERO_ADDRESS,
        directAmount: 0n,
        grandparentRecipient: ZERO_ADDRESS,
        grandparentAmount: 0n,
        unallocatedAmount: 100n,
      });

      expect(db.referralPointAllocation.upsert).toHaveBeenCalled();
      expect(db.referral.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("PointsAdded events", () => {
    test("saves earned points and the chain milestone", async () => {
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
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        update: { lastProcessedBlock: 101n, lastProcessedLogIndex: 3 },
        create: { id: 1, lastProcessedBlock: 101n, lastProcessedLogIndex: 3 },
      });
    });

    test("saves pending points", async () => {
      const { onPointsAdded } = await startListener();

      await onPointsAdded(pointsEvent({ isPending: true }));

      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xabc" },
        data: { pendingPoints: 100, milestoneLevel: 2 },
      });
    });

    // A balance can go up from a direct referral or a grandparent's share, so it can't say which invite it is for
    test.each([false, true])("never changes an invite's points (pending: %s)", async (isPending) => {
      const { onPointsAdded } = await startListener();

      await onPointsAdded(pointsEvent({ isPending }));

      expect(db.referral.findFirst).not.toHaveBeenCalled();
      expect(db.referral.update).not.toHaveBeenCalled();
      expect(db.referral.updateMany).not.toHaveBeenCalled();
    });

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
      expect(db.referral.updateMany).toHaveBeenCalledTimes(1);
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid" },
        data: { status: 1, isVerified: true },
      });
      expect(mockReadService.getReferralPointPool).not.toHaveBeenCalled();
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

    test("gives a new pending invite the whole pool when its referrer has no referrer", async () => {
      const { onInviteChanged } = await startListener();

      await onInviteChanged({ ...inviteEvent, status: 0 });

      expect(mockReadService.getReferrers).toHaveBeenCalledWith("0xREF");
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid" },
        data: { status: 0, isVerified: true },
      });
      // Only an invite nobody has signed up with yet; a used one gets its points from the payout
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid", refereeId: null },
        data: { points: 100 },
      });
    });

    test("gives a new pending invite the pool minus the grandparent's rounded-down share", async () => {
      const { onInviteChanged } = await startListener();
      mockReadService.getReferralPointPool.mockResolvedValue(101n);
      mockReadService.getReferrers.mockResolvedValue("0xGRANDPARENT");

      await onInviteChanged({ ...inviteEvent, status: 0 });

      // 20% of 101 rounds down to 20, so the referrer gets the other 81
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid", refereeId: null },
        data: { points: 81 },
      });
    });

    test("still saves the status and records the block when the pool cannot be read", async () => {
      const { onInviteChanged } = await startListener();
      mockReadService.getReferralPointPool.mockRejectedValue(new Error("rpc error"));

      await onInviteChanged({ ...inviteEvent, status: 0 });

      expect(db.referral.updateMany).toHaveBeenCalledTimes(1);
      expect(db.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "invite-uuid" },
        data: { status: 0, isVerified: true },
      });
      expect(consoleWarn).toHaveBeenCalledWith(
        "Could not read the referral pool for invite 0xinvite, leaving its points",
      );
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

    test("saves pending points while catching up", async () => {
      db.user.findUnique.mockResolvedValue(savedUser({ pendingPoints: 10 }));
      mockReadService.getPointsAddedEvents.mockResolvedValue([pastPoints(12n, 0, "0xAAA", 40n, true)]);

      await startListener();

      expect(db.user.update).toHaveBeenCalledWith({
        where: { walletAddress: "0xaaa" },
        data: { pendingPoints: 40, milestoneLevel: 2 },
      });
      expect(db.referral.updateMany).not.toHaveBeenCalled();
    });

    test("keeps catching up when the pool for a pending invite cannot be read", async () => {
      mockReadService.getReferralPointPool.mockRejectedValue(new Error("rpc error"));
      mockReadService.getInviteChangedEvents.mockResolvedValue([
        { blockNumber: 12n, logIndex: 0, args: { inviteId: "0xinvite", referrer: "0xAAA", status: 0 } },
      ]);
      mockReadService.getPointsAddedEvents.mockResolvedValue([pastPoints(13n, 0, "0xAAA", 100n)]);

      await startListener();

      expect(db.user.update).toHaveBeenCalled();
      expect(db.chainSyncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { lastProcessedBlock: 13n, lastProcessedLogIndex: 0 },
        }),
      );
      expect(mockReadService.listenToPointsAddedEvent).toHaveBeenCalled();
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

    describe("per-invite points in a two-level referral", () => {
      // A small in-memory database, so a whole chain of events runs against real rows
      let users: Record<string, any>;
      let referrals: any[];

      const matches = (row: any, where: any) =>
        Object.entries(where).every(([key, value]: [string, any]) => {
          if (key === "referrer" || key === "referee") {
            const user = Object.values(users).find((u) => u.id === row[`${key}Id`]);
            return user?.walletAddress === value.walletAddress;
          }
          return row[key] === value;
        });

      const pastAllocation = (
        blockNumber: bigint,
        logIndex: number,
        participant: string,
        directRecipient: string,
        directAmount: bigint,
        grandparentRecipient: string,
        grandparentAmount: bigint,
      ) => ({
        blockNumber,
        logIndex,
        transactionHash: `0xtx${blockNumber}`,
        args: {
          participant,
          pool: 100n,
          directRecipient,
          directAmount,
          grandparentRecipient,
          grandparentAmount,
          unallocatedAmount: 0n,
        },
      });

      // The invite ID on chain is the row ID here, so events point straight at rows
      const pastInvite = (blockNumber: bigint, logIndex: number, inviteId: string, referrer: string, status: number) => ({
        blockNumber,
        logIndex,
        args: { inviteId, referrer, status },
      });

      beforeEach(() => {
        users = {
          "0xgrandparent": savedUser({ id: "grandparent", walletAddress: "0xgrandparent" }),
          "0xparent": savedUser({ id: "parent", walletAddress: "0xparent" }),
          "0xchild": savedUser({ id: "child", walletAddress: "0xchild" }),
        };
        referrals = [];
        (bytes32ToUuid as jest.Mock).mockImplementation((inviteId: string) => inviteId);
        db.user.findUnique.mockImplementation(({ where }: any) =>
          Promise.resolve(users[where.walletAddress] ?? null),
        );
        db.user.update.mockImplementation(({ where, data }: any) =>
          Promise.resolve(Object.assign(users[where.walletAddress], data)),
        );
        db.referral.findFirst.mockImplementation(({ where }: any) =>
          Promise.resolve([...referrals].reverse().find((row) => matches(row, where)) ?? null),
        );
        db.referral.update.mockImplementation(({ where, data }: any) =>
          Promise.resolve(Object.assign(referrals.find((row) => row.id === where.id), data)),
        );
        db.referral.updateMany.mockImplementation(({ where, data }: any) => {
          const rows = referrals.filter((row) => matches(row, where));
          rows.forEach((row) => Object.assign(row, data));
          return Promise.resolve({ count: rows.length });
        });
      });

      afterEach(() => {
        (bytes32ToUuid as jest.Mock).mockImplementation(() => "invite-uuid");
      });

      test("each invite gets its referrer's share, and a grandparent's share never lands on their own invite", async () => {
        // Rows the API creates at sign-up, before each chain transaction
        referrals.push(
          { id: "grandparent-invites-parent", referrerId: "grandparent", refereeId: "parent", status: 0, points: 0 },
          { id: "parent-invites-child", referrerId: "parent", refereeId: "child", status: 0, points: 0 },
        );
        // Two acceptInvite transactions, with events in the order the contract emits them:
        // the parent joins through the grandparent (block 12), then the child through the parent (block 13)
        mockReadService.getPointsAddedEvents.mockResolvedValue([
          pastPoints(12n, 0, "0xGRANDPARENT", 100n),
          pastPoints(12n, 2, "0xPARENT", 50n),
          pastPoints(13n, 0, "0xPARENT", 130n),
          pastPoints(13n, 1, "0xGRANDPARENT", 120n),
          pastPoints(13n, 3, "0xCHILD", 50n),
        ]);
        mockReadService.getReferralPointsAllocatedEvents.mockResolvedValue([
          pastAllocation(12n, 1, "0xPARENT", "0xGRANDPARENT", 100n, ZERO_ADDRESS, 0n),
          pastAllocation(13n, 2, "0xCHILD", "0xPARENT", 80n, "0xGRANDPARENT", 20n),
        ]);
        mockReadService.getInviteChangedEvents.mockResolvedValue([
          pastInvite(12n, 3, "grandparent-invites-parent", "0xGRANDPARENT", 1),
          pastInvite(13n, 4, "parent-invites-child", "0xPARENT", 1),
        ]);

        await startListener();

        expect(referrals).toEqual([
          expect.objectContaining({ id: "grandparent-invites-parent", status: 1, points: 100 }),
          expect.objectContaining({ id: "parent-invites-child", status: 1, points: 80 }),
        ]);
        expect(users["0xgrandparent"].earnedPoints).toBe(120);
        expect(users["0xparent"].earnedPoints).toBe(130);
      });

      test("a new pending invite shows its referrer's share, and the grandparent's pending share stays off their invites", async () => {
        referrals.push(
          // The grandparent created an invite but never sent its chain transaction
          { id: "grandparent-unsent", referrerId: "grandparent", refereeId: null, status: 0, points: 0 },
          { id: "parent-private", referrerId: "parent", refereeId: null, status: 0, points: 0 },
        );
        // The parent was referred by the grandparent
        mockReadService.getReferrers.mockResolvedValue("0xGRANDPARENT");
        // createInvite raises both pending balances, then registers the invite
        mockReadService.getPointsAddedEvents.mockResolvedValue([
          pastPoints(12n, 0, "0xPARENT", 80n, true),
          pastPoints(12n, 1, "0xGRANDPARENT", 20n, true),
        ]);
        mockReadService.getInviteChangedEvents.mockResolvedValue([
          pastInvite(12n, 2, "parent-private", "0xPARENT", 0),
        ]);

        await startListener();

        expect(referrals).toEqual([
          expect.objectContaining({ id: "grandparent-unsent", points: 0 }),
          expect.objectContaining({ id: "parent-private", status: 0, points: 80 }),
        ]);
        expect(users["0xgrandparent"].pendingPoints).toBe(20);
      });
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
