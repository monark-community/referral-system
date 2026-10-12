import type { Request, Response } from "express";
import {
  getCampaign,
  getCampaigns,
} from "@/controllers/campaign.controller.js";
import {
  CampaignServiceError,
  getBuiltinReferralCampaign,
} from "@/services/campaign.service.js";

jest.mock("@/services/campaign.service", () => ({
  CampaignServiceError: jest.requireActual("@/services/campaign.service").CampaignServiceError,
  getBuiltinReferralCampaign: jest.fn(),
}));

const getBuiltin = getBuiltinReferralCampaign as jest.Mock;

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

describe("campaign controller", () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    getBuiltin.mockReset();
  });

  afterAll(() => {
    consoleError.mockRestore();
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
});
