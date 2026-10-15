import type { Request, Response } from "express";
import { createClient } from "@reffinity/blockchain-connector/clients";
import {
  getCampaign,
  getCampaigns,
  getMyCampaignFulfillment,
} from "@/controllers/campaign.controller.js";
import {
  CampaignServiceError,
  getBuiltinReferralCampaign,
} from "@/services/campaign.service.js";
import {
  getCurrentBuiltinReferralFulfillment,
  refreshCurrentBuiltinReferralFulfillment,
} from "@/services/campaignFulfillment.service.js";

jest.mock("@/services/campaign.service", () => ({
  CampaignServiceError: jest.requireActual("@/services/campaign.service").CampaignServiceError,
  getBuiltinReferralCampaign: jest.fn(),
}));
jest.mock("@/services/campaignFulfillment.service", () => ({
  getCurrentBuiltinReferralFulfillment: jest.fn(),
  refreshCurrentBuiltinReferralFulfillment: jest.fn(),
}));
jest.mock(
  "@reffinity/blockchain-connector/clients",
  () => ({ createClient: jest.fn(() => ({ publicClient: {} })) }),
  { virtual: true },
);

const getBuiltin = getBuiltinReferralCampaign as jest.Mock;
const getCurrentFulfillment = getCurrentBuiltinReferralFulfillment as jest.Mock;
const refreshCurrentFulfillment =
  refreshCurrentBuiltinReferralFulfillment as jest.Mock;
const mockCreateClient = createClient as jest.Mock;

function definition(): Record<string, any> {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    key: "builtin-referral",
    title: "Referral",
    description: "Built-in referral campaign",
    status: "ACTIVE",
    isSystem: true,
    schemaVersion: 1,
    task: {
      id: "00000000-0000-4000-8000-000000000002",
      type: "REFERRAL",
      strategyKey: "REFERRAL_V1",
      schemaVersion: 1,
      configuration: {},
      verificationPolicy: {
        id: "00000000-0000-4000-8000-000000000003",
        taskId: "00000000-0000-4000-8000-000000000002",
        type: "AUTOMATIC_CHAIN",
        strategyKey: "REFERRAL_ACCEPTED_V1",
        schemaVersion: 1,
        configuration: {},
      },
      rewardPolicy: {
        id: "00000000-0000-4000-8000-000000000004",
        taskId: "00000000-0000-4000-8000-000000000002",
        type: "POINTS",
        strategyKey: "REFERRAL_POINTS_V1",
        schemaVersion: 1,
        configuration: {
          completerAction: "ACCEPTED_INVITE",
          referralPoolAction: "REFERRED_NEW_USER",
          referralAllocation: "CONTRACT_CONFIGURED_SPLIT",
        },
      },
    },
  };
}

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function fulfillment(
  status: "PENDING" | "VERIFIED" | "REWARDED" = "REWARDED",
) {
  return {
    id: "fulfillment-1",
    taskId: "00000000-0000-4000-8000-000000000002",
    participantId: "user-1",
    referralId: "referral-1",
    attempt: 1,
    status,
    chainId: 31337,
    verificationTransactionHash: `0x${"ab".repeat(32)}`,
    verificationBlockNumber: 42n,
    verificationLogIndex: 4,
    rewardTransactionHash: status === "REWARDED" ? `0x${"ab".repeat(32)}` : null,
    rewardBlockNumber: status === "REWARDED" ? 42n : null,
    rewardLogIndex: status === "REWARDED" ? 5 : null,
    verifiedAt: new Date("2026-10-13T12:00:00.000Z"),
    rewardedAt:
      status === "REWARDED" ? new Date("2026-10-13T12:00:00.000Z") : null,
  };
}

describe("campaign controller", () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    getBuiltin.mockReset();
    getCurrentFulfillment.mockReset();
    refreshCurrentFulfillment.mockReset();
    mockCreateClient.mockReset().mockReturnValue({ publicClient: {} });
  });

  afterAll(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  test("lists a public summary without task details", async () => {
    getBuiltin.mockResolvedValue(definition());
    const res = response();

    await getCampaigns({} as Request, res);

    expect(res.json).toHaveBeenCalledWith({
      campaigns: [expect.objectContaining({ key: "builtin-referral", status: "ACTIVE" })],
    });
    expect((res.json as jest.Mock).mock.calls[0][0].campaigns[0]).not.toHaveProperty("task");
  });

  test.each([
    "builtin-referral",
    "00000000-0000-4000-8000-000000000001",
  ])("returns detail for lookup %s", async (idOrKey) => {
    getBuiltin.mockResolvedValue(definition());
    const res = response();

    await getCampaign({ params: { idOrKey } } as unknown as Request, res);

    expect(res.json).toHaveBeenCalledWith({
      campaign: expect.objectContaining({
        key: "builtin-referral",
        task: expect.objectContaining({
          type: "REFERRAL",
          verificationPolicy: expect.objectContaining({ type: "AUTOMATIC_CHAIN" }),
          rewardPolicy: expect.objectContaining({ type: "POINTS" }),
        }),
      }),
    });
    const task = (res.json as jest.Mock).mock.calls[0][0].campaign.task;
    expect(task.verificationPolicy).not.toHaveProperty("taskId");
    expect(task.rewardPolicy).not.toHaveProperty("taskId");
  });

  test("returns 404 for an unknown lookup", async () => {
    getBuiltin.mockResolvedValue(definition());
    const res = response();

    await getCampaign({ params: { idOrKey: "unknown" } } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Campaign not found" });
  });

  test("returns the authenticated user's fulfillment with string block references", async () => {
    getBuiltin.mockResolvedValue(definition());
    getCurrentFulfillment.mockResolvedValue(fulfillment());
    const res = response();
    const req = {
      params: { idOrKey: "builtin-referral" },
      user: { id: "user-1", walletAddress: "0xabc" },
    } as unknown as Request;

    await getMyCampaignFulfillment(req, res);

    expect(res.json).toHaveBeenCalledWith({
      fulfillment: expect.objectContaining({
        id: "fulfillment-1",
        campaignId: definition().id,
        status: "REWARDED",
        verification: expect.objectContaining({ blockNumber: "42", logIndex: 4 }),
        reward: expect.objectContaining({ blockNumber: "42", logIndex: 5 }),
      }),
    });
    expect(refreshCurrentFulfillment).not.toHaveBeenCalled();
  });

  test("attempts one read-through refresh for VERIFIED and returns its durable result", async () => {
    getBuiltin.mockResolvedValue(definition());
    const verified = fulfillment("VERIFIED");
    const rewarded = fulfillment("REWARDED");
    getCurrentFulfillment.mockResolvedValue(verified);
    refreshCurrentFulfillment.mockResolvedValue(rewarded);
    const res = response();
    const req = {
      params: { idOrKey: definition().id },
      user: { id: "user-1", walletAddress: "0xabc" },
    } as unknown as Request;

    await getMyCampaignFulfillment(req, res);

    expect(refreshCurrentFulfillment).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      fulfillment: expect.objectContaining({ status: "REWARDED" }),
    });
  });

  test("returns null when the current user has not fulfilled the campaign", async () => {
    getBuiltin.mockResolvedValue(definition());
    getCurrentFulfillment.mockResolvedValue(null);
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "builtin-referral" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ fulfillment: null });
  });

  test("returns PENDING with null event evidence without attempting recovery", async () => {
    getBuiltin.mockResolvedValue(definition());
    getCurrentFulfillment.mockResolvedValue({
      ...fulfillment("PENDING"),
      verificationTransactionHash: null,
      verificationBlockNumber: null,
      verificationLogIndex: null,
      verifiedAt: null,
    });
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "builtin-referral" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      fulfillment: expect.objectContaining({
        status: "PENDING",
        verification: null,
        reward: null,
      }),
    });
    expect(refreshCurrentFulfillment).not.toHaveBeenCalled();
  });

  test("logs an incomplete VERIFIED refresh and returns the durable status", async () => {
    getBuiltin.mockResolvedValue(definition());
    const verified = fulfillment("VERIFIED");
    getCurrentFulfillment.mockResolvedValue(verified);
    refreshCurrentFulfillment.mockImplementation(
      async (_client, current, onRefreshError) => {
        onRefreshError("receipt unavailable");
        return current;
      },
    );
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "builtin-referral" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(consoleWarn).toHaveBeenCalledWith(
      "Campaign fulfillment read-through incomplete",
      { fulfillmentId: "fulfillment-1", message: "receipt unavailable" },
    );
    expect(res.json).toHaveBeenCalledWith({
      fulfillment: expect.objectContaining({ status: "VERIFIED", reward: null }),
    });
  });

  test("returns durable VERIFIED when the chain client is unavailable", async () => {
    getBuiltin.mockResolvedValue(definition());
    getCurrentFulfillment.mockResolvedValue(fulfillment("VERIFIED"));
    mockCreateClient.mockImplementationOnce(() => {
      throw new Error("RPC_URL is not defined");
    });
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "builtin-referral" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(consoleWarn).toHaveBeenCalledWith(
      "Campaign fulfillment read-through unavailable",
      { fulfillmentId: "fulfillment-1", message: "RPC_URL is not defined" },
    );
    expect(refreshCurrentFulfillment).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      fulfillment: expect.objectContaining({ status: "VERIFIED" }),
    });
  });

  test("returns 404 before reading fulfillment for an unknown campaign", async () => {
    getBuiltin.mockResolvedValue(definition());
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "unknown" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Campaign not found" });
    expect(getCurrentFulfillment).not.toHaveBeenCalled();
  });

  test("requires authentication before reading fulfillment state", async () => {
    const res = response();

    await getMyCampaignFulfillment(
      { params: { idOrKey: "builtin-referral" } } as unknown as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(getBuiltin).not.toHaveBeenCalled();
  });

  test.each([
    [getCampaigns, "BUILTIN_CAMPAIGN_NOT_FOUND"],
    [getCampaign, "INVALID_BUILTIN_CAMPAIGN"],
  ])("maps campaign configuration errors to 503", async (handler, code) => {
    getBuiltin.mockRejectedValue(new CampaignServiceError(code as any, "invalid"));
    const res = response();
    const req = { params: { idOrKey: "builtin-referral" } } as unknown as Request;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Campaign configuration unavailable" });
  });

  test.each([
    [getCampaigns, "Failed to get campaigns"],
    [getCampaign, "Failed to get campaign"],
  ])("maps unexpected errors to 500", async (handler, message) => {
    getBuiltin.mockRejectedValue(new Error("database unavailable"));
    const res = response();
    const req = { params: { idOrKey: "builtin-referral" } } as unknown as Request;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: message });
  });

  test.each([
    [new CampaignServiceError("INVALID_BUILTIN_CAMPAIGN", "invalid"), 503,
      "Campaign configuration unavailable"],
    [new Error("database unavailable"), 500, "Failed to get campaign fulfillment"],
  ])("maps fulfillment read errors to %s", async (error, status, message) => {
    getBuiltin.mockRejectedValue(error);
    const res = response();

    await getMyCampaignFulfillment(
      {
        params: { idOrKey: "builtin-referral" },
        user: { id: "user-1", walletAddress: "0xabc" },
      } as unknown as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: message });
  });
});
