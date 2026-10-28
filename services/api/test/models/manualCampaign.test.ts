// Purpose: Tests the user campaign rules for what a creator may send, what proof looks like, and stored rows
// Notes:
// - Pure validation, so nothing is mocked

import {
  ManualCampaignDataError,
  ManualCampaignValidationError,
  parseManualCampaignInput,
  parseWei,
  UINT256_MAX,
  parseProof,
  parseRejectionReason,
  parseStoredManualCampaign,
  type StoredManualCampaign,
} from "@/models/manualCampaign.js";

const now = new Date("2026-10-17T12:00:00.000Z");

function body(overrides: Record<string, unknown> = {}) {
  return {
    title: "Follow Dave's company",
    description: "Help us grow",
    instructions: "Follow @dave and paste the link to your profile",
    category: "SOCIAL_MEDIA",
    completerPoints: 30,
    referralPoolPoints: 10,
    maxCompletions: 50,
    endsAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function fieldOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ManualCampaignValidationError) return error.field;
    throw error;
  }
  throw new Error("expected a validation error");
}

describe("parseManualCampaignInput", () => {
  test("accepts a complete campaign, trimming text and reading the end date", () => {
    expect(parseManualCampaignInput(body({ title: "  Follow Dave  " }), { now })).toEqual({
      title: "Follow Dave",
      description: "Help us grow",
      instructions: "Follow @dave and paste the link to your profile",
      category: "SOCIAL_MEDIA",
      rewardType: "POINTS",
      completerPoints: 30,
      referralPoolPoints: 10,
      maxCompletions: 50,
      endsAt: new Date("2026-11-01T00:00:00.000Z"),
      isPrivate: false,
    });
  });

  test("the description is optional", () => {
    expect(parseManualCampaignInput(body({ description: undefined }), { now }).description).toBe("");
  });

  test("a campaign is public unless the creator makes it private", () => {
    expect(parseManualCampaignInput(body(), { now }).isPrivate).toBe(false);
    expect(parseManualCampaignInput(body({ isPrivate: true }), { now }).isPrivate).toBe(true);
    expect(fieldOf(() => parseManualCampaignInput(body({ isPrivate: "yes" }), { now }))).toBe("isPrivate");
  });

  test.each([
    ["title", { title: "   " }],
    ["title", { title: "x".repeat(121) }],
    ["instructions", { instructions: undefined }],
    ["description", { description: "x".repeat(501) }],
    ["category", { category: "SUBSCRIPTION" }],
    ["completerPoints", { completerPoints: -1 }],
    ["completerPoints", { completerPoints: 2.5 }],
    ["referralPoolPoints", { referralPoolPoints: "10" }],
    ["maxCompletions", { maxCompletions: 0 }],
    ["endsAt", { endsAt: "next week" }],
    ["endsAt", { endsAt: 1767225600000 }],
    ["endsAt", { endsAt: "2026-10-17T11:59:59.000Z" }],
  ])("rejects a bad %s", (field, overrides) => {
    expect(fieldOf(() => parseManualCampaignInput(body(overrides), { now }))).toBe(field);
  });

  test("a campaign must pay at least one point", () => {
    expect(fieldOf(() => parseManualCampaignInput(body({ completerPoints: 0, referralPoolPoints: 0 }), { now }))).toBe(
      "completerPoints",
    );
    // Either part alone is enough
    const onePart = parseManualCampaignInput(body({ completerPoints: 0 }), { now });
    expect(onePart.rewardType === "POINTS" && onePart.referralPoolPoints).toBe(10);
  });

  test("an edit keeps the stored value of every field it leaves out, then checks the whole", () => {
    const current = parseManualCampaignInput(body(), { now });

    expect(parseManualCampaignInput({ title: "New title" }, { now, current })).toEqual({ ...current, title: "New title" });
    // Being private is kept the same way
    const privateCurrent = { ...current, isPrivate: true };
    expect(parseManualCampaignInput({ title: "New title" }, { now, current: privateCurrent }).isPrivate).toBe(true);
    expect(parseManualCampaignInput({ isPrivate: false }, { now, current: privateCurrent }).isPrivate).toBe(false);
    // The merged campaign must still be valid
    expect(fieldOf(() => parseManualCampaignInput({ completerPoints: 0, referralPoolPoints: 0 }, { now, current }))).toBe(
      "completerPoints",
    );
  });

  test("rejects a body that is not an object", () => {
    expect(fieldOf(() => parseManualCampaignInput(null, { now }))).toBe("body");
    expect(fieldOf(() => parseManualCampaignInput([body()], { now }))).toBe("body");
  });
});

describe("Direct reward input", () => {
  const direct = (overrides: Record<string, unknown> = {}) => body({
    rewardType: "DIRECT",
    completerPoints: undefined,
    referralPoolPoints: undefined,
    completerRewardWei: "3000000000000000",
    referralPoolWei: "1000000000000000",
    initialFundingRuns: 10,
    ...overrides,
  });

  test("parses lossless wei and initial run count", () => {
    expect(parseManualCampaignInput(direct(), { now })).toEqual(expect.objectContaining({
      rewardType: "DIRECT",
      completerRewardWei: "3000000000000000",
      referralPoolWei: "1000000000000000",
      initialFundingRuns: 10,
    }));
  });

  test.each(["", "-1", "+1", "1.2", "1e3", "0x10", "01", 1, (UINT256_MAX + 1n).toString()])(
    "rejects invalid wei %p",
    (value) => expect(() => parseWei(value, "amount")).toThrow(ManualCampaignValidationError),
  );

  test("requires a non-zero per-run reward and positive whole runs", () => {
    expect(fieldOf(() => parseManualCampaignInput(direct({ completerRewardWei: "0", referralPoolWei: "0" }), { now }))).toBe("completerRewardWei");
    expect(fieldOf(() => parseManualCampaignInput(direct({ initialFundingRuns: 0 }), { now }))).toBe("initialFundingRuns");
  });

  test("rejects fields from the other reward discriminator", () => {
    expect(fieldOf(() => parseManualCampaignInput(direct({ completerPoints: 1 }), { now }))).toBe("rewardType");
    expect(fieldOf(() => parseManualCampaignInput(body({ completerRewardWei: "1" }), { now }))).toBe("rewardType");
  });
});

describe("parseProof", () => {
  test("social media proof is a link to the post or profile", () => {
    expect(parseProof("SOCIAL_MEDIA", " https://x.com/alice/status/1 ")).toBe("https://x.com/alice/status/1");
    expect(fieldOf(() => parseProof("SOCIAL_MEDIA", "@alice"))).toBe("proof");
    expect(fieldOf(() => parseProof("SOCIAL_MEDIA", "ftp://example.com/post"))).toBe("proof");
  });

  test("community proof is a username or short text", () => {
    expect(parseProof("COMMUNITY", "alice#1234")).toBe("alice#1234");
  });

  test.each([["empty", ""], ["missing", undefined], ["too long", "x".repeat(501)]])(
    "rejects %s proof",
    (_case, proof) => {
      expect(fieldOf(() => parseProof("COMMUNITY", proof))).toBe("proof");
    },
  );
});

test("a rejection needs a short reason", () => {
  expect(parseRejectionReason(" The link is to someone else's profile ")).toBe("The link is to someone else's profile");
  expect(fieldOf(() => parseRejectionReason(""))).toBe("reason");
  expect(fieldOf(() => parseRejectionReason("x".repeat(501)))).toBe("reason");
});

describe("parseStoredManualCampaign", () => {
  function row(overrides: Partial<StoredManualCampaign> = {}): StoredManualCampaign {
    return {
      id: "campaign-1",
      key: "campaign-1",
      title: "Follow Dave",
      description: "",
      instructions: "Follow @dave",
      isSystem: false,
      status: "ACTIVE",
      ownerId: "dave",
      owner: { name: "Dave", walletAddress: "0xdave" },
      maxCompletions: 50,
      endsAt: new Date("2026-11-01T00:00:00.000Z"),
      isPrivate: false,
      privateCode: null,
      publishedAt: new Date("2026-10-17T12:00:00.000Z"),
      createdAt: new Date("2026-10-16T12:00:00.000Z"),
      task: {
        id: "task-1",
        type: "BOUNTY",
        strategyKey: "BOUNTY_V1",
        configuration: { category: "COMMUNITY" },
        verificationPolicy: { type: "MANUAL", strategyKey: "OWNER_APPROVAL_V1" },
        rewardPolicy: {
          id: "reward-1",
          type: "POINTS",
          strategyKey: "CAMPAIGN_POINTS_V1",
          configuration: { completerPoints: 30, referralPoolPoints: 10 },
        },
      },
      ...overrides,
    };
  }

  test("reads a stored campaign with its task and reward", () => {
    expect(parseStoredManualCampaign(row())).toEqual(
      expect.objectContaining({
        id: "campaign-1",
        ownerId: "dave",
        owner: { name: "Dave", walletAddress: "0xdave" },
        status: "ACTIVE",
        category: "COMMUNITY",
        completerPoints: 30,
        referralPoolPoints: 10,
        taskId: "task-1",
        rewardPolicyId: "reward-1",
        isPrivate: false,
        privateCode: null,
      }),
    );
  });

  test("reads a private campaign's code", () => {
    expect(parseStoredManualCampaign(row({ isPrivate: true, privateCode: "secret-code" }))).toEqual(
      expect.objectContaining({ isPrivate: true, privateCode: "secret-code" }),
    );
  });

  test.each([
    ["the built-in campaign", { isSystem: true }],
    ["a campaign without an owner", { ownerId: null, owner: null }],
    ["an unknown status", { status: "ARCHIVED" }],
    ["a missing end date", { endsAt: null }],
    ["a missing task", { task: null }],
    ["a private campaign without a code", { isPrivate: true, privateCode: null }],
    ["a public campaign with a code", { privateCode: "secret-code" }],
  ])("refuses %s", (_case, overrides) => {
    expect(() => parseStoredManualCampaign(row(overrides as Partial<StoredManualCampaign>))).toThrow(
      ManualCampaignDataError,
    );
  });

  test.each([
    ["a referral task", { type: "REFERRAL" }],
    ["automatic verification", { verificationPolicy: { type: "AUTOMATIC_CHAIN", strategyKey: "REFERRAL_ACCEPTED_V1" } }],
    ["a task without a category", { configuration: {} }],
    [
      "a reward without amounts",
      { rewardPolicy: { id: "reward-1", type: "POINTS", strategyKey: "CAMPAIGN_POINTS_V1", configuration: {} } },
    ],
  ])("refuses %s", (_case, taskOverrides) => {
    const stored = row();
    expect(() =>
      parseStoredManualCampaign({ ...stored, task: { ...stored.task!, ...(taskOverrides as object) } }),
    ).toThrow(ManualCampaignDataError);
  });
});
