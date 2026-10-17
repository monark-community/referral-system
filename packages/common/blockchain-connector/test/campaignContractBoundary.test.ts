// Purpose: Verifies the generalized campaign surface on the single ReferralProgram boundary.

import { contracts } from "../contracts.js";
import {
  CampaignRewardType,
  CampaignTaskType,
  CampaignVerificationType,
  ReadReferralContractService,
} from "../readReferralContract.service.js";

describe("campaign contract boundary", () => {
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
      readContract: jest.fn(),
      watchContractEvent: jest.fn().mockReturnValue(unwatch),
      getContractEvents: jest.fn().mockResolvedValue([]),
    };
    service = new ReadReferralContractService({ publicClient });
  });

  test("the ReferralProgram ABI exposes campaign functions, events, and errors", () => {
    for (const [type, name] of [
      ["function", "createCampaign"],
      ["function", "submitCampaignFulfillment"],
      ["function", "verifyCampaignFulfillment"],
      ["function", "rejectCampaignFulfillment"],
      ["function", "setMaxCampaignPointsPerCompletion"],
      ["event", "CampaignCreated"],
      ["event", "CampaignFulfillmentSubmitted"],
      ["event", "CampaignFulfillmentVerified"],
      ["event", "CampaignFulfillmentRejected"],
      ["event", "CampaignRewardPaid"],
      ["error", "UnsupportedCampaignCombination"],
      ["error", "UnauthorizedManualVerifier"],
      ["error", "CampaignOwnerCannotParticipate"],
      ["error", "CampaignRewardAboveMaximum"],
    ]) {
      expect(
        contracts.referral.abi.some(
          (item) => item.type === type && "name" in item && item.name === name,
        ),
      ).toBe(true);
    }
  });

  test("getMaxCampaignPointsPerCompletion reads the admin-set cap", async () => {
    publicClient.readContract.mockResolvedValueOnce(1000n);

    await expect(service.getMaxCampaignPointsPerCompletion()).resolves.toBe(1000n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "maxCampaignPointsPerCompletion" }),
    );
  });

  test.each([
    ["getCampaign", ["0xcampaign"], "getCampaign"],
    ["getCampaignFulfillment", ["0xfulfillment"], "getCampaignFulfillment"],
    [
      "getParticipantCampaignFulfillment",
      ["0xcampaign", "0x0000000000000000000000000000000000000001"],
      "getParticipantCampaignFulfillment",
    ],
  ] as const)("%s forwards a typed facade read", async (method, args, functionName) => {
    const expected = { id: args[0] };
    publicClient.readContract.mockResolvedValueOnce(expected);

    const result = await (service[method] as (...values: any[]) => Promise<unknown>)(
      ...args,
    );

    expect(result).toBe(expected);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName, args }),
    );
  });

  test.each([
    [
      "listenToCampaignCreatedEvent",
      "CampaignCreated",
      {
        campaignId: "0xcampaign",
        owner: "0xowner",
        taskType: CampaignTaskType.Bounty,
        verificationType: CampaignVerificationType.Manual,
        rewardType: CampaignRewardType.Points,
        completerReward: 30n,
        referralPool: 10n,
      },
    ],
    [
      "listenToCampaignFulfillmentSubmittedEvent",
      "CampaignFulfillmentSubmitted",
      {
        campaignId: "0xcampaign",
        fulfillmentId: "0xfulfillment",
        participant: "0xparticipant",
        taskType: CampaignTaskType.Bounty,
      },
    ],
    [
      "listenToCampaignFulfillmentVerifiedEvent",
      "CampaignFulfillmentVerified",
      {
        campaignId: "0xcampaign",
        fulfillmentId: "0xfulfillment",
        verifier: "0xowner",
        participant: "0xparticipant",
        verificationType: CampaignVerificationType.Manual,
      },
    ],
    [
      "listenToCampaignFulfillmentRejectedEvent",
      "CampaignFulfillmentRejected",
      {
        campaignId: "0xcampaign",
        fulfillmentId: "0xfulfillment",
        verifier: "0xowner",
        participant: "0xparticipant",
      },
    ],
    [
      "listenToCampaignRewardPaidEvent",
      "CampaignRewardPaid",
      {
        campaignId: "0xcampaign",
        fulfillmentId: "0xfulfillment",
        participant: "0xparticipant",
        rewardType: CampaignRewardType.Points,
        completerReward: 30n,
        referralPool: 10n,
        referralPayout: {
          directRecipient: "0xparent",
          grandparentRecipient: "0xgrandparent",
          directAmount: 8n,
          grandparentAmount: 2n,
          unallocatedAmount: 0n,
        },
      },
    ],
  ] as const)(
    "%s includes identity fields and stable chain position",
    async (method, eventName, args) => {
      const callback = jest.fn();
      await (service[method] as any)(callback, 5000);
      const registration = publicClient.watchContractEvent.mock.calls[0][0];

      expect(registration).toEqual(
        expect.objectContaining({ eventName, pollingInterval: 5000 }),
      );

      await registration.onLogs([
        {
          args,
          blockNumber: 12n,
          logIndex: 3,
          transactionHash: "0xtransaction",
        },
        { blockNumber: 13n, logIndex: 0 },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        ...args,
        blockNumber: 12n,
        logIndex: 3,
        transactionHash: "0xtransaction",
      });
    },
  );

  test.each([
    ["getCampaignCreatedEvents", "CampaignCreated"],
    [
      "getCampaignFulfillmentSubmittedEvents",
      "CampaignFulfillmentSubmitted",
    ],
    ["getCampaignFulfillmentVerifiedEvents", "CampaignFulfillmentVerified"],
    ["getCampaignFulfillmentRejectedEvents", "CampaignFulfillmentRejected"],
    ["getCampaignRewardPaidEvents", "CampaignRewardPaid"],
  ] as const)("%s reads %s over a block range", async (method, eventName) => {
    const expected = [{ blockNumber: 2n }];
    publicClient.getContractEvents.mockResolvedValueOnce(expected);

    const result = await service[method]({ fromBlock: 1n, toBlock: 3n });

    expect(result).toBe(expected);
    expect(publicClient.getContractEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventName, fromBlock: 1n, toBlock: 3n }),
    );
  });

  test.each([
    ["listenToCampaignCreatedEvent", "stopListeningToCampaignCreatedEvent"],
    [
      "listenToCampaignFulfillmentSubmittedEvent",
      "stopListeningToCampaignFulfillmentSubmittedEvent",
    ],
    [
      "listenToCampaignFulfillmentVerifiedEvent",
      "stopListeningToCampaignFulfillmentVerifiedEvent",
    ],
    [
      "listenToCampaignFulfillmentRejectedEvent",
      "stopListeningToCampaignFulfillmentRejectedEvent",
    ],
    ["listenToCampaignRewardPaidEvent", "stopListeningToCampaignRewardPaidEvent"],
  ] as const)("%s is stopped only once", async (listenMethod, stopMethod) => {
    await (service[listenMethod] as any)(jest.fn());
    await service[stopMethod]();
    await service[stopMethod]();

    expect(unwatch).toHaveBeenCalledTimes(1);
  });
});
