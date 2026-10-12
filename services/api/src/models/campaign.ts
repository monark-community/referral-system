export const BUILTIN_REFERRAL_CAMPAIGN_KEY = "builtin-referral" as const;

export type CampaignStatus = "ACTIVE" | "ARCHIVED";
export type CampaignFulfillmentStatus = "PENDING" | "VERIFIED" | "REWARDED";

export type ReferralTaskDefinition = {
  id: string;
  type: "REFERRAL";
  strategyKey: "REFERRAL_V1";
  schemaVersion: 1;
  configuration: Record<string, never>;
};

export type CampaignTaskDefinition = ReferralTaskDefinition;

export type ReferralVerificationPolicyDefinition = {
  id: string;
  taskId: string;
  type: "AUTOMATIC_CHAIN";
  strategyKey: "REFERRAL_ACCEPTED_V1";
  schemaVersion: 1;
  configuration: Record<string, never>;
};

export type CampaignVerificationPolicyDefinition = ReferralVerificationPolicyDefinition;

export type ReferralRewardConfiguration = {
  completerAction: "ACCEPTED_INVITE";
  referralPoolAction: "REFERRED_NEW_USER";
  referralAllocation: "CONTRACT_CONFIGURED_SPLIT";
};

export type ReferralRewardPolicyDefinition = {
  id: string;
  taskId: string;
  type: "POINTS";
  strategyKey: "REFERRAL_POINTS_V1";
  schemaVersion: 1;
  configuration: ReferralRewardConfiguration;
};

export type CampaignRewardPolicyDefinition = ReferralRewardPolicyDefinition;

export type BuiltinReferralCampaignDefinition = {
  id: string;
  key: typeof BUILTIN_REFERRAL_CAMPAIGN_KEY;
  title: string;
  description: string;
  isSystem: true;
  status: CampaignStatus;
  schemaVersion: 1;
  task: ReferralTaskDefinition & {
    verificationPolicy: ReferralVerificationPolicyDefinition;
    rewardPolicy: ReferralRewardPolicyDefinition;
  };
};

export type CampaignValidationErrorCode =
  | "INVALID_SHAPE"
  | "INVALID_CAMPAIGN_KEY"
  | "INVALID_CAMPAIGN_STATUS"
  | "INVALID_SYSTEM_CAMPAIGN"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "UNSUPPORTED_TASK_TYPE"
  | "UNSUPPORTED_TASK_STRATEGY"
  | "INVALID_TASK_CONFIGURATION"
  | "UNSUPPORTED_VERIFICATION_TYPE"
  | "UNSUPPORTED_VERIFICATION_STRATEGY"
  | "INVALID_VERIFICATION_CONFIGURATION"
  | "UNSUPPORTED_REWARD_TYPE"
  | "UNSUPPORTED_REWARD_STRATEGY"
  | "INVALID_REWARD_CONFIGURATION"
  | "MISMATCHED_POLICY_COMBINATION";

export class CampaignValidationError extends Error {
  constructor(
    public readonly code: CampaignValidationErrorCode,
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "CampaignValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

function recordAt(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignValidationError("INVALID_SHAPE", path, "must be an object");
  }
  return value as UnknownRecord;
}

function stringAt(record: UnknownRecord, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CampaignValidationError("INVALID_SHAPE", `${path}.${key}`, "must be a non-empty string");
  }
  return value;
}

function requireLiteral(
  record: UnknownRecord,
  key: string,
  expected: string | number | boolean,
  code: CampaignValidationErrorCode,
  path: string,
): void {
  if (record[key] !== expected) {
    throw new CampaignValidationError(code, `${path}.${key}`, `must be ${JSON.stringify(expected)}`);
  }
}

function requireEmptyConfiguration(
  value: unknown,
  code: CampaignValidationErrorCode,
  path: string,
): Record<string, never> {
  const configuration = recordAt(value, path);
  if (Object.keys(configuration).length !== 0) {
    throw new CampaignValidationError(code, path, "must be an empty object");
  }
  return configuration as Record<string, never>;
}

function parseRewardConfiguration(value: unknown): ReferralRewardConfiguration {
  const path = "campaign.task.rewardPolicy.configuration";
  const configuration = recordAt(value, path);
  const expectedKeys = ["completerAction", "referralPoolAction", "referralAllocation"];
  const keys = Object.keys(configuration);
  if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !keys.includes(key))) {
    throw new CampaignValidationError(
      "INVALID_REWARD_CONFIGURATION",
      path,
      `must contain exactly ${expectedKeys.join(", ")}`,
    );
  }
  requireLiteral(configuration, "completerAction", "ACCEPTED_INVITE", "INVALID_REWARD_CONFIGURATION", path);
  requireLiteral(configuration, "referralPoolAction", "REFERRED_NEW_USER", "INVALID_REWARD_CONFIGURATION", path);
  requireLiteral(configuration, "referralAllocation", "CONTRACT_CONFIGURED_SPLIT", "INVALID_REWARD_CONFIGURATION", path);
  return {
    completerAction: "ACCEPTED_INVITE",
    referralPoolAction: "REFERRED_NEW_USER",
    referralAllocation: "CONTRACT_CONFIGURED_SPLIT",
  };
}

export function parseBuiltinReferralCampaignDefinition(
  value: unknown,
): BuiltinReferralCampaignDefinition {
  const campaign = recordAt(value, "campaign");
  requireLiteral(campaign, "key", BUILTIN_REFERRAL_CAMPAIGN_KEY, "INVALID_CAMPAIGN_KEY", "campaign");
  requireLiteral(campaign, "isSystem", true, "INVALID_SYSTEM_CAMPAIGN", "campaign");
  requireLiteral(campaign, "schemaVersion", 1, "UNSUPPORTED_SCHEMA_VERSION", "campaign");

  if (campaign.status !== "ACTIVE" && campaign.status !== "ARCHIVED") {
    throw new CampaignValidationError(
      "INVALID_CAMPAIGN_STATUS",
      "campaign.status",
      "must be ACTIVE or ARCHIVED",
    );
  }

  const task = recordAt(campaign.task, "campaign.task");
  requireLiteral(task, "type", "REFERRAL", "UNSUPPORTED_TASK_TYPE", "campaign.task");
  requireLiteral(task, "strategyKey", "REFERRAL_V1", "UNSUPPORTED_TASK_STRATEGY", "campaign.task");
  requireLiteral(task, "schemaVersion", 1, "UNSUPPORTED_SCHEMA_VERSION", "campaign.task");
  const taskConfiguration = requireEmptyConfiguration(
    task.configuration,
    "INVALID_TASK_CONFIGURATION",
    "campaign.task.configuration",
  );

  const verificationPolicy = recordAt(
    task.verificationPolicy,
    "campaign.task.verificationPolicy",
  );
  requireLiteral(
    verificationPolicy,
    "type",
    "AUTOMATIC_CHAIN",
    "UNSUPPORTED_VERIFICATION_TYPE",
    "campaign.task.verificationPolicy",
  );
  requireLiteral(
    verificationPolicy,
    "strategyKey",
    "REFERRAL_ACCEPTED_V1",
    "UNSUPPORTED_VERIFICATION_STRATEGY",
    "campaign.task.verificationPolicy",
  );
  requireLiteral(
    verificationPolicy,
    "schemaVersion",
    1,
    "UNSUPPORTED_SCHEMA_VERSION",
    "campaign.task.verificationPolicy",
  );
  const verificationConfiguration = requireEmptyConfiguration(
    verificationPolicy.configuration,
    "INVALID_VERIFICATION_CONFIGURATION",
    "campaign.task.verificationPolicy.configuration",
  );

  const rewardPolicy = recordAt(task.rewardPolicy, "campaign.task.rewardPolicy");
  requireLiteral(
    rewardPolicy,
    "type",
    "POINTS",
    "UNSUPPORTED_REWARD_TYPE",
    "campaign.task.rewardPolicy",
  );
  requireLiteral(
    rewardPolicy,
    "strategyKey",
    "REFERRAL_POINTS_V1",
    "UNSUPPORTED_REWARD_STRATEGY",
    "campaign.task.rewardPolicy",
  );
  requireLiteral(
    rewardPolicy,
    "schemaVersion",
    1,
    "UNSUPPORTED_SCHEMA_VERSION",
    "campaign.task.rewardPolicy",
  );

  const taskId = stringAt(task, "id", "campaign.task");
  const verificationTaskId = stringAt(
    verificationPolicy,
    "taskId",
    "campaign.task.verificationPolicy",
  );
  const rewardTaskId = stringAt(rewardPolicy, "taskId", "campaign.task.rewardPolicy");
  if (verificationTaskId !== taskId || rewardTaskId !== taskId) {
    throw new CampaignValidationError(
      "MISMATCHED_POLICY_COMBINATION",
      "campaign.task",
      "verification and reward policies must belong to the parsed task",
    );
  }

  return {
    id: stringAt(campaign, "id", "campaign"),
    key: BUILTIN_REFERRAL_CAMPAIGN_KEY,
    title: stringAt(campaign, "title", "campaign"),
    description: typeof campaign.description === "string" ? campaign.description : "",
    isSystem: true,
    status: campaign.status,
    schemaVersion: 1,
    task: {
      id: taskId,
      type: "REFERRAL",
      strategyKey: "REFERRAL_V1",
      schemaVersion: 1,
      configuration: taskConfiguration,
      verificationPolicy: {
        id: stringAt(verificationPolicy, "id", "campaign.task.verificationPolicy"),
        taskId: verificationTaskId,
        type: "AUTOMATIC_CHAIN",
        strategyKey: "REFERRAL_ACCEPTED_V1",
        schemaVersion: 1,
        configuration: verificationConfiguration,
      },
      rewardPolicy: {
        id: stringAt(rewardPolicy, "id", "campaign.task.rewardPolicy"),
        taskId: rewardTaskId,
        type: "POINTS",
        strategyKey: "REFERRAL_POINTS_V1",
        schemaVersion: 1,
        configuration: parseRewardConfiguration(rewardPolicy.configuration),
      },
    },
  };
}
