import { prisma } from "@/lib/prisma.js";
import {
  CampaignServiceError,
  getBuiltinReferralCampaign,
} from "@/services/campaign.service.js";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: {
      findMany: jest.fn(),
    },
  },
}));

const findMany = prisma.campaign.findMany as jest.Mock;

function storedCampaign(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: "campaign-1",
    key: "builtin-referral",
    title: "Referral",
    description: "Built-in referral campaign",
    isSystem: true,
    status: "ACTIVE",
    schemaVersion: 1,
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T00:00:00.000Z"),
    task: {
      id: "task-1",
      campaignId: "campaign-1",
      type: "REFERRAL",
      strategyKey: "REFERRAL_V1",
      schemaVersion: 1,
      configuration: {},
      verificationPolicy: {
        id: "verification-1",
        taskId: "task-1",
        type: "AUTOMATIC_CHAIN",
        strategyKey: "REFERRAL_ACCEPTED_V1",
        schemaVersion: 1,
        configuration: {},
      },
      rewardPolicy: {
        id: "reward-1",
        taskId: "task-1",
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
    ...overrides,
  };
}

function expectServiceCode(promise: Promise<unknown>, code: string): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: "CampaignServiceError",
    code,
  });
}

describe("getBuiltinReferralCampaign", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  test("loads and validates the built-in definition in one read", async () => {
    findMany.mockResolvedValue([storedCampaign()]);

    const campaign = await getBuiltinReferralCampaign();

    expect(findMany).toHaveBeenCalledWith({
      where: { key: "builtin-referral" },
      include: {
        task: {
          include: {
            verificationPolicy: true,
            rewardPolicy: true,
          },
        },
      },
      take: 2,
    });
    expect(campaign).toMatchObject({
      key: "builtin-referral",
      status: "ACTIVE",
      task: {
        type: "REFERRAL",
        verificationPolicy: { type: "AUTOMATIC_CHAIN" },
        rewardPolicy: {
          type: "POINTS",
          configuration: {
            completerAction: "ACCEPTED_INVITE",
            referralPoolAction: "REFERRED_NEW_USER",
            referralAllocation: "CONTRACT_CONFIGURED_SPLIT",
          },
        },
      },
    });
    expect(campaign).not.toHaveProperty("createdAt");
  });

  test("rejects a missing built-in definition", async () => {
    findMany.mockResolvedValue([]);
    await expectServiceCode(getBuiltinReferralCampaign(), "BUILTIN_CAMPAIGN_NOT_FOUND");
  });

  test("rejects an impossible duplicate built-in definition", async () => {
    findMany.mockResolvedValue([storedCampaign(), storedCampaign({ id: "campaign-2" })]);
    await expectServiceCode(getBuiltinReferralCampaign(), "DUPLICATE_BUILTIN_CAMPAIGN");
  });

  test("rejects an archived built-in definition", async () => {
    findMany.mockResolvedValue([storedCampaign({ status: "ARCHIVED" })]);
    await expectServiceCode(getBuiltinReferralCampaign(), "BUILTIN_CAMPAIGN_ARCHIVED");
  });

  test.each([
    ["missing task", { task: null }],
    ["unknown task strategy", {
      task: { ...storedCampaign().task, strategyKey: "UNKNOWN_TASK" },
    }],
    ["missing verification policy", {
      task: { ...storedCampaign().task, verificationPolicy: null },
    }],
    ["missing reward policy", {
      task: { ...storedCampaign().task, rewardPolicy: null },
    }],
  ])("rejects invalid configuration: %s", async (_name, overrides) => {
    findMany.mockResolvedValue([storedCampaign(overrides)]);

    await expect(getBuiltinReferralCampaign()).rejects.toMatchObject({
      name: "CampaignServiceError",
      code: "INVALID_BUILTIN_CAMPAIGN",
      validationError: expect.any(Error),
    });
  });

  test("uses the explicit service error type", async () => {
    findMany.mockResolvedValue([]);
    await expect(getBuiltinReferralCampaign()).rejects.toBeInstanceOf(CampaignServiceError);
  });
});
