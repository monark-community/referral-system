import {
  BUILTIN_REFERRAL_CAMPAIGN_KEY,
  CampaignValidationError,
  parseBuiltinReferralCampaignDefinition,
} from "@/models/campaign.js";

function validDefinition(): Record<string, any> {
  return {
    id: "campaign-1",
    key: BUILTIN_REFERRAL_CAMPAIGN_KEY,
    title: "Referral",
    description: "Built-in referral campaign",
    isSystem: true,
    status: "ACTIVE",
    schemaVersion: 1,
    task: {
      id: "task-1",
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
  };
}

function expectCode(value: unknown, code: string): void {
  expect(() => parseBuiltinReferralCampaignDefinition(value)).toThrow(
    expect.objectContaining({ code }),
  );
}

describe("parseBuiltinReferralCampaignDefinition", () => {
  test("returns the typed built-in Referral definition", () => {
    expect(parseBuiltinReferralCampaignDefinition(validDefinition())).toEqual(validDefinition());
  });

  test.each([
    ["task", "MANUAL", "UNSUPPORTED_TASK_TYPE"],
    ["verificationPolicy", "MANUAL", "UNSUPPORTED_VERIFICATION_TYPE"],
    ["rewardPolicy", "TOKEN", "UNSUPPORTED_REWARD_TYPE"],
  ])("rejects an unknown %s type", (target, type, code) => {
    const definition = validDefinition();
    const record = target === "task" ? definition.task : definition.task[target];
    record.type = type;
    expectCode(definition, code);
  });

  test.each([
    ["task", "UNKNOWN_TASK", "UNSUPPORTED_TASK_STRATEGY"],
    ["verificationPolicy", "UNKNOWN_VERIFIER", "UNSUPPORTED_VERIFICATION_STRATEGY"],
    ["rewardPolicy", "UNKNOWN_REWARD", "UNSUPPORTED_REWARD_STRATEGY"],
  ])("rejects an unknown %s strategy", (target, strategyKey, code) => {
    const definition = validDefinition();
    const record = target === "task" ? definition.task : definition.task[target];
    record.strategyKey = strategyKey;
    expectCode(definition, code);
  });

  test.each(["schemaVersion", "task.schemaVersion", "verificationPolicy.schemaVersion", "rewardPolicy.schemaVersion"])(
    "rejects unsupported %s",
    (target) => {
      const definition = validDefinition();
      if (target === "schemaVersion") definition.schemaVersion = 2;
      else if (target === "task.schemaVersion") definition.task.schemaVersion = 2;
      else if (target === "verificationPolicy.schemaVersion") {
        definition.task.verificationPolicy.schemaVersion = 2;
      } else definition.task.rewardPolicy.schemaVersion = 2;
      expectCode(definition, "UNSUPPORTED_SCHEMA_VERSION");
    },
  );

  test("rejects a missing reward configuration field", () => {
    const definition = validDefinition();
    delete definition.task.rewardPolicy.configuration.referralAllocation;
    expectCode(definition, "INVALID_REWARD_CONFIGURATION");
  });

  test("rejects an extra reward configuration field", () => {
    const definition = validDefinition();
    definition.task.rewardPolicy.configuration.currency = "POINTS";
    expectCode(definition, "INVALID_REWARD_CONFIGURATION");
  });

  test.each([
    ["completerPoints", 50],
    ["referralPoolPoints", 100],
    ["directReferralBasisPoints", 8000],
  ])("rejects numeric reward configuration %s", (field, amount) => {
    const definition = validDefinition();
    definition.task.rewardPolicy.configuration[field] = amount;
    expectCode(definition, "INVALID_REWARD_CONFIGURATION");
  });

  test("rejects policies attached to a different task", () => {
    const definition = validDefinition();
    definition.task.rewardPolicy.taskId = "other-task";
    expectCode(definition, "MISMATCHED_POLICY_COMBINATION");
  });

  test("exposes a specific error with the invalid field path", () => {
    try {
      parseBuiltinReferralCampaignDefinition({});
      throw new Error("expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CampaignValidationError);
      expect(error).toMatchObject({ code: "INVALID_CAMPAIGN_KEY", path: "campaign.key" });
    }
  });
});
