// Purpose: Tests the Read Client functionality
// Notes:
// - For now calls the basic functions and tests the direct read functions

import { ReadReferralContractService } from "../readReferralContract.service.js";
import { createWebSocketClient } from "../clients.js";
import { PublicClient, ReadContractParameters } from "viem";
import { contracts } from "../contracts.js";

// Mock the createWebSocketClient so it returns a mocked publicClient
jest.mock("../clients.js", () => ({
  createWebSocketClient: jest.fn(),
}));

describe("ReadReferralContractService", () => {
  let mockPublicClient: Partial<PublicClient>;
  let service: ReadReferralContractService;

  beforeEach(() => {
    // Create a mocked PublicClient
    mockPublicClient = {
      readContract: jest.fn(
        async (args: ReadContractParameters<any, string, readonly any[]>) => {
          if (args.functionName === "viewPoints") return 42;
          if (args.functionName === "viewReferrals") return ["0xabc", "0xdef"];
          if (args.functionName === "viewAllReferrals") {
            return [
              { level: 1, referral: "0xabc" },
              { level: 2, referral: "0xdef" },
            ];
          }
          if (args.functionName === "viewReferrer") return "0xxyz";
          if (args.functionName === "viewAncestors") {
            return ["0xparent", "0xgrandparent"];
          }
          throw new Error(`Unexpected function: ${args.functionName}`);
        },
      ) as unknown as PublicClient["readContract"],
    } as unknown as PublicClient;

    // Make createWebSocketClient return this mocked client
    (createWebSocketClient as jest.Mock).mockReturnValue({
      publicClient: mockPublicClient,
    });

    // Now instantiate your service; it will use the mocked publicClient
    service = new ReadReferralContractService({
      publicClient: mockPublicClient as PublicClient,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns mocked points from getUserCurrentPoints", async () => {
    const points = await service.getUserCurrentPoints("0x123");
    expect(points).toBe(42);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "viewPoints", args: ["0x123"] }),
    );
  });

  test("returns mocked referrals from getReferrals", async () => {
    const referrals = await service.getReferrals("0x123");
    expect(referrals).toEqual(["0xabc", "0xdef"]);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "viewReferrals",
        args: ["0x123"],
      }),
    );
  });

  test("returns mocked referrer from getReferrers", async () => {
    const referrer = await service.getReferrers("0x123");
    expect(referrer).toBe("0xxyz");
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "viewReferrer",
        args: ["0x123"],
      }),
    );
  });

  test("returns mocked two-level referrals from getAllReferrals", async () => {
    const referrals = await service.getAllReferrals("0x123");
    expect(referrals).toEqual([
      { level: 1, referral: "0xabc" },
      { level: 2, referral: "0xdef" },
    ]);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "viewAllReferrals",
        args: ["0x123"],
      }),
    );
  });

  test("returns mocked parent and grandparent from getAncestors", async () => {
    const ancestors = await service.getAncestors("0x123");
    expect(ancestors).toEqual(["0xparent", "0xgrandparent"]);
    expect(mockPublicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "viewAncestors",
        args: ["0x123"],
      }),
    );
  });
});

describe("ReadReferralContractService milestones and events", () => {
  let publicClient: {
    readContract: jest.Mock;
    watchContractEvent: jest.Mock;
    getContractEvents: jest.Mock;
  };
  let unwatch: jest.Mock;
  let service: ReadReferralContractService;

  beforeEach(() => {
    unwatch = jest.fn();
    publicClient = {
      readContract: jest.fn().mockResolvedValue(3n),
      watchContractEvent: jest.fn().mockReturnValue(unwatch),
      getContractEvents: jest.fn().mockResolvedValue([]),
    };
    service = new ReadReferralContractService({ publicClient });
  });

  // The onLogs handler the service registered with watchContractEvent
  function registeredOnLogs() {
    return publicClient.watchContractEvent.mock.calls[0][0].onLogs;
  }

  test("reads the user's current milestone", async () => {
    const milestone = await service.getUserCurrentMilestone("0x123");

    expect(milestone).toBe(3n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getCurrentUserMilestone",
        args: ["0x123"],
      }),
    );
  });

  test("the packaged ReferralProgram ABI exposes PointsAdded to listeners", () => {
    expect(
      contracts.referral.abi.some(
        (item) => item.type === "event" && item.name === "PointsAdded",
      ),
    ).toBe(true);
  });

  test("passes each PointsAdded log to the callback and skips logs without args", async () => {
    const callback = jest.fn();
    await service.listenToPointsAddedEvent(callback, 5000);

    expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "PointsAdded", pollingInterval: 5000 }),
    );

    registeredOnLogs()([
      { args: { user: "0xabc", points: 100n, isPending: false }, blockNumber: 7n, logIndex: 2 },
      { blockNumber: 8n, logIndex: 0 },
    ]);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      user: "0xabc",
      points: 100n,
      isPending: false,
      blockNumber: 7n,
      logIndex: 2,
    });
  });

  test("passes each InviteChanged log to the callback and skips logs without args", async () => {
    const callback = jest.fn();
    await service.listenToInviteChangedEvent(callback, 5000);

    expect(publicClient.watchContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "InviteChanged", pollingInterval: 5000 }),
    );

    registeredOnLogs()([
      { args: { inviteId: "0xinvite", referrer: "0xref", status: 1 }, blockNumber: 9n, logIndex: 1 },
      { blockNumber: 10n, logIndex: 0 },
    ]);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      inviteId: "0xinvite",
      status: 1,
      referrer: "0xref",
      blockNumber: 9n,
      logIndex: 1,
    });
  });

  test("polls every 10 seconds when no interval is given", async () => {
    await service.listenToPointsAddedEvent(jest.fn());
    await service.listenToInviteChangedEvent(jest.fn());

    expect(publicClient.watchContractEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pollingInterval: 10000 }),
    );
    expect(publicClient.watchContractEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pollingInterval: 10000 }),
    );
  });

  test.each([
    ["getPointsAddedEvents", "PointsAdded"],
    ["getInviteChangedEvents", "InviteChanged"],
  ] as const)("%s fetches past %s events in a block range", async (method, eventName) => {
    const events = [{ blockNumber: 5n }];
    publicClient.getContractEvents.mockResolvedValue(events);

    const result = await service[method]({ fromBlock: 1n, toBlock: 10n });

    expect(result).toBe(events);
    expect(publicClient.getContractEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventName, fromBlock: 1n, toBlock: 10n }),
    );
  });

  test("stops the PointsAdded listener only once", async () => {
    await service.listenToPointsAddedEvent(jest.fn());

    await service.stopListeningToPointsAddedEvent();
    await service.stopListeningToPointsAddedEvent();

    expect(unwatch).toHaveBeenCalledTimes(1);
  });

  test("stops the InviteChanged listener only once", async () => {
    await service.listenToInviteChangedEvent(jest.fn());

    await service.stopListeningToInviteChangedEvent();
    await service.stopListeningToInviteChangedEvent();

    expect(unwatch).toHaveBeenCalledTimes(1);
  });

  test("stopping before listening does nothing", async () => {
    await service.stopListeningToPointsAddedEvent();
    await service.stopListeningToInviteChangedEvent();

    expect(unwatch).not.toHaveBeenCalled();
  });
});
