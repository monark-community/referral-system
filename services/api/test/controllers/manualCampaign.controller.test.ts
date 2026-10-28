// Purpose: Tests the user campaign endpoints: status codes, response shapes, and when a contract call is included
// Notes:
// - The service's database work is mocked; its contract-call builders are real, so the calls the UI sends can be checked
// - Also covers the public board, detail and "my fulfillment" reads, which serve user campaigns beside the built-in one

import type { Request, Response } from "express";
import {
  approveCampaignSubmission,
  changeCampaignStatus,
  createCampaign,
  getCampaignSubmissions,
  getMyCampaigns,
  rejectCampaignSubmission,
  submitCampaignProof,
  updateCampaign,
} from "@/controllers/manualCampaign.controller.js";
import {
  getCampaign,
  getCampaigns,
  getMyCampaignFulfillment,
  getPrivateCampaign,
} from "@/controllers/campaign.controller.js";
import { ManualCampaignDataError, type ManualCampaignDefinition } from "@/models/manualCampaign.js";
import * as service from "@/services/manualCampaign.service.js";
import { getBuiltinReferralCampaign } from "@/services/campaign.service.js";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/manualCampaign.service", () => {
  const actual = jest.requireActual("@/services/manualCampaign.service");
  return {
    ManualCampaignError: actual.ManualCampaignError,
    createCampaignCall: actual.createCampaignCall,
    submitFulfillmentCall: actual.submitFulfillmentCall,
    decideFulfillmentCall: actual.decideFulfillmentCall,
    approveManualCampaignSubmission: jest.fn(),
    changeManualCampaignStatus: jest.fn(),
    countSpotsTaken: jest.fn(),
    createManualCampaignDraft: jest.fn(),
    findManualCampaign: jest.fn(),
    findPrivateManualCampaign: jest.fn(),
    getMyManualCampaignFulfillment: jest.fn(),
    listJoinedManualCampaigns: jest.fn(),
    listManualCampaignSubmissions: jest.fn(),
    listOpenManualCampaigns: jest.fn(),
    listOwnedManualCampaigns: jest.fn(),
    rejectManualCampaignSubmission: jest.fn(),
    submitManualCampaignProof: jest.fn(),
    updateManualCampaignDraft: jest.fn(),
  };
});
jest.mock("@/services/campaign.service", () => ({
  CampaignServiceError: jest.requireActual("@/services/campaign.service").CampaignServiceError,
  getBuiltinReferralCampaign: jest.fn(),
}));
jest.mock("@/services/campaignFulfillment.service", () => ({
  getCurrentBuiltinReferralFulfillment: jest.fn(),
  refreshCurrentBuiltinReferralFulfillment: jest.fn(),
}));
jest.mock("@reffinity/blockchain-connector/clients", () => ({ createClient: jest.fn() }), { virtual: true });
jest.mock(
  "@reffinity/blockchain-connector/readReferralContract",
  () => ({ ReadReferralContractService: jest.fn() }),
  { virtual: true },
);
jest.mock(
  "@reffinity/blockchain-connector/uuidBytesConverter",
  () => ({ uuidToBytes32: (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}` }),
  { virtual: true },
);

const mocked = service as unknown as Record<string, jest.Mock>;
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const FULFILLMENT_ID = "22222222-2222-4222-8222-222222222222";
const bytes32 = (uuid: string) => `0x${uuid.replace(/-/g, "").padEnd(64, "0")}`;

function campaign(overrides: Partial<ManualCampaignDefinition> = {}): ManualCampaignDefinition {
  return {
    id: CAMPAIGN_ID,
    key: CAMPAIGN_ID,
    ownerId: "dave",
    owner: { name: "Dave", walletAddress: "0xdave" },
    title: "Follow Dave",
    description: "",
    instructions: "Follow @dave and paste the link",
    status: "ACTIVE",
    category: "SOCIAL_MEDIA",
    completerPoints: 30,
    referralPoolPoints: 10,
    maxCompletions: 5,
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    isPrivate: false,
    privateCode: null,
    taskId: "task-1",
    rewardPolicyId: "reward-1",
    publishedAt: new Date("2026-10-17T00:00:00.000Z"),
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    ...overrides,
  };
}

function fulfillment(overrides: Record<string, unknown> = {}): any {
  return {
    id: FULFILLMENT_ID,
    taskId: "task-1",
    participantId: "alice",
    referralId: null,
    attempt: 1,
    idempotencyKey: "manual:task-1:alice",
    status: "SUBMITTED",
    chainId: 31337,
    proof: "https://x.com/alice",
    rejectionReason: null,
    completerReward: null,
    reviewedAt: null,
    submissionTransactionHash: null,
    submissionBlockNumber: null,
    submissionLogIndex: null,
    submittedAt: null,
    verificationTransactionHash: null,
    verificationBlockNumber: null,
    verificationLogIndex: null,
    verifiedAt: null,
    rejectedAt: null,
    rewardTransactionHash: null,
    rewardBlockNumber: null,
    rewardLogIndex: null,
    rewardedAt: null,
    createdAt: new Date("2026-10-17T12:00:00.000Z"),
    updatedAt: new Date("2026-10-17T12:00:00.000Z"),
    participant: { id: "alice", name: "Alice", walletAddress: "0xalice" },
    ...overrides,
  };
}

function response(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function request(overrides: Record<string, unknown> = {}): Request {
  return { user: { id: "dave" }, params: { id: CAMPAIGN_ID }, body: {}, query: {}, ...overrides } as unknown as Request;
}

const body = (res: ReturnType<typeof response>) => res.json.mock.calls[0][0];

beforeEach(() => {
  jest.resetAllMocks();
  mocked.countSpotsTaken.mockResolvedValue(new Map());
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("errors", () => {
  test.each([
    ["INVALID_INPUT", 400],
    ["REWARD_ABOVE_MAXIMUM", 400],
    ["NOT_CAMPAIGN_OWNER", 403],
    ["OWN_CAMPAIGN", 403],
    ["CAMPAIGN_NOT_FOUND", 404],
    ["NOT_EDITABLE", 409],
    ["CAMPAIGN_FULL", 409],
    ["CHAIN_UNAVAILABLE", 503],
  ])("a %s error is a %i with its code", async (code, status) => {
    mocked.createManualCampaignDraft.mockRejectedValue(new service.ManualCampaignError(code as any, "Nope", "title"));
    const res = response();

    await createCampaign(request(), res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(body(res)).toEqual({ error: "Nope", code, field: "title" });
  });

  test("an unexpected error is a 500 without its details", async () => {
    mocked.createManualCampaignDraft.mockRejectedValue(new Error("connection reset"));
    const res = response();

    await createCampaign(request(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body(res)).toEqual({ error: "Failed to create campaign" });
  });

  test("a stored campaign that fails to parse is a 500", async () => {
    mocked.listOwnedManualCampaigns.mockRejectedValue(new ManualCampaignDataError(CAMPAIGN_ID, "its task is not a bounty"));
    mocked.listJoinedManualCampaigns.mockResolvedValue([]);
    const res = response();

    await getMyCampaigns(request(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body(res)).toEqual({ error: "Campaign data is invalid" });
  });

  test.each([
    ["createCampaign", createCampaign],
    ["updateCampaign", updateCampaign],
    ["changeCampaignStatus", changeCampaignStatus],
    ["getMyCampaigns", getMyCampaigns],
    ["submitCampaignProof", submitCampaignProof],
    ["getCampaignSubmissions", getCampaignSubmissions],
    ["approveCampaignSubmission", approveCampaignSubmission],
    ["rejectCampaignSubmission", rejectCampaignSubmission],
  ])("%s needs a login", async (_name, handler) => {
    const res = response();

    await handler(request({ user: undefined }), res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("the creator's campaigns", () => {
  test("a new draft comes back with the createCampaign call for the creator's wallet", async () => {
    mocked.createManualCampaignDraft.mockResolvedValue(campaign({ status: "DRAFT", publishedAt: null }));
    const res = response();

    await createCampaign(request({ body: { title: "Follow Dave" } }), res);

    expect(mocked.createManualCampaignDraft).toHaveBeenCalledWith("dave", { title: "Follow Dave" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res).campaign).toEqual(
      expect.objectContaining({
        id: CAMPAIGN_ID,
        status: "DRAFT",
        taskType: "BOUNTY",
        category: "SOCIAL_MEDIA",
        verificationType: "MANUAL",
        reward: { type: "POINTS", completerPoints: 30, referralPoolPoints: 10 },
        instructions: "Follow @dave and paste the link",
        spotsLeft: 5,
        endsAt: "2026-11-01T00:00:00.000Z",
        isPrivate: false,
        privateCode: null,
        chain: { functionName: "createCampaign", args: [bytes32(CAMPAIGN_ID), 1, 1, 0, 30, 10] },
      }),
    );
  });

  test("the creator's views of a private campaign carry the code for its link", async () => {
    const secret = campaign({ isPrivate: true, privateCode: "secret-code" });
    mocked.createManualCampaignDraft.mockResolvedValue({ ...secret, status: "DRAFT", publishedAt: null });
    mocked.listOwnedManualCampaigns.mockResolvedValue([
      { campaign: secret, submissions: { SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0, REWARDED: 0 } },
    ]);
    mocked.listJoinedManualCampaigns.mockResolvedValue([]);
    mocked.countSpotsTaken.mockResolvedValue(new Map());
    const created = response();
    const mine = response();

    await createCampaign(request({ body: { isPrivate: true } }), created);
    await getMyCampaigns(request(), mine);

    expect(body(created).campaign).toEqual(expect.objectContaining({ isPrivate: true, privateCode: "secret-code" }));
    expect(body(mine).created[0]).toEqual(expect.objectContaining({ isPrivate: true, privateCode: "secret-code" }));
  });

  test("an edit is passed the campaign id, and a published campaign has no createCampaign call", async () => {
    mocked.updateManualCampaignDraft.mockResolvedValue(campaign({ status: "DRAFT", publishedAt: null }));
    mocked.changeManualCampaignStatus.mockResolvedValue(campaign({ status: "PAUSED" }));
    const edited = response();
    const paused = response();

    await updateCampaign(request({ body: { title: "New" } }), edited);
    await changeCampaignStatus(request({ body: { status: "PAUSED" } }), paused);

    expect(mocked.updateManualCampaignDraft).toHaveBeenCalledWith("dave", CAMPAIGN_ID, { title: "New" });
    expect(mocked.changeManualCampaignStatus).toHaveBeenCalledWith("dave", CAMPAIGN_ID, "PAUSED");
    expect(body(paused).campaign).toEqual(expect.objectContaining({ status: "PAUSED", chain: null }));
  });

  test("my campaigns lists what I created with submission counts, and what I joined with my status", async () => {
    mocked.listOwnedManualCampaigns.mockResolvedValue([
      {
        campaign: campaign(),
        submissions: { SUBMITTED: 1, UNDER_REVIEW: 1, APPROVED: 0, REJECTED: 2, REWARDED: 1 },
      },
    ]);
    const joined = campaign({ id: "33333333-3333-4333-8333-333333333333", ownerId: "erin", taskId: "task-2" });
    mocked.listJoinedManualCampaigns.mockResolvedValue([
      {
        campaign: joined,
        fulfillment: fulfillment({
          status: "REWARDED",
          completerReward: 30,
          rewardTransactionHash: "0xreward",
          rewardBlockNumber: 42n,
          rewardLogIndex: 3,
        }),
      },
    ]);
    mocked.countSpotsTaken.mockResolvedValue(new Map([["task-2", 4]]));
    const res = response();

    await getMyCampaigns(request(), res);

    const { created, joined: mine } = body(res);
    // Rejected submissions free their spot: 5 - (1 + 1 + 1)
    expect(created[0]).toEqual(expect.objectContaining({ spotsLeft: 2, submissions: expect.any(Object) }));
    expect(mine[0].campaign).toEqual(expect.objectContaining({ id: joined.id, spotsLeft: 1 }));
    expect(mine[0].fulfillment).toEqual(
      expect.objectContaining({
        status: "REWARDED",
        completerReward: 30,
        reward: { transactionHash: "0xreward", blockNumber: "42", logIndex: 3 },
        chain: null,
      }),
    );
  });

  test("a private campaign I joined shows in my list without its code", async () => {
    mocked.listOwnedManualCampaigns.mockResolvedValue([]);
    mocked.listJoinedManualCampaigns.mockResolvedValue([
      {
        campaign: campaign({ ownerId: "erin", isPrivate: true, privateCode: "secret-code" }),
        fulfillment: fulfillment({ status: "UNDER_REVIEW" }),
      },
    ]);
    mocked.countSpotsTaken.mockResolvedValue(new Map());
    const res = response();

    await getMyCampaigns(request({ user: { id: "alice" } }), res);

    expect(body(res).joined[0].campaign).toEqual(expect.objectContaining({ isPrivate: true }));
    expect(body(res).joined[0].campaign).not.toHaveProperty("privateCode");
  });
});

describe("submitting proof", () => {
  test("a saved submission comes back with the call that puts it on chain", async () => {
    mocked.submitManualCampaignProof.mockResolvedValue({ campaign: campaign(), fulfillment: fulfillment() });
    const res = response();

    await submitCampaignProof(request({ user: { id: "alice" }, body: { proof: "https://x.com/alice" } }), res);

    expect(mocked.submitManualCampaignProof).toHaveBeenCalledWith("alice", CAMPAIGN_ID, { proof: "https://x.com/alice" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res).fulfillment).toEqual(
      expect.objectContaining({
        id: FULFILLMENT_ID,
        status: "SUBMITTED",
        proof: "https://x.com/alice",
        submission: null,
        chain: {
          functionName: "submitCampaignFulfillment",
          args: [bytes32(CAMPAIGN_ID), bytes32(FULFILLMENT_ID)],
        },
      }),
    );
  });

  test("the code from a private campaign's link is passed on with the proof", async () => {
    mocked.submitManualCampaignProof.mockResolvedValue({ campaign: campaign(), fulfillment: fulfillment() });
    const proof = { proof: "https://x.com/alice", code: "secret-code" };

    await submitCampaignProof(request({ user: { id: "alice" }, body: proof }), response());

    expect(mocked.submitManualCampaignProof).toHaveBeenCalledWith("alice", CAMPAIGN_ID, proof);
  });

  test("a private campaign without the right code is a 404", async () => {
    mocked.submitManualCampaignProof.mockRejectedValue(
      new service.ManualCampaignError("CAMPAIGN_NOT_FOUND", "Campaign not found"),
    );
    const res = response();

    await submitCampaignProof(request({ user: { id: "alice" }, body: { proof: "https://x.com/alice" } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(body(res)).toEqual({ error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" });
  });
});

describe("reviewing", () => {
  test("the queue shows each participant, and the decision call only while the chain doesn't have it", async () => {
    mocked.listManualCampaignSubmissions.mockResolvedValue({
      campaign: campaign(),
      fulfillments: [
        fulfillment({ status: "UNDER_REVIEW", submissionTransactionHash: "0xsub", submissionBlockNumber: 7n, submissionLogIndex: 0 }),
        fulfillment({ id: "approved-here", status: "APPROVED" }),
        fulfillment({ id: "approved-on-chain", status: "APPROVED", verifiedAt: new Date() }),
      ],
    });
    const res = response();

    await getCampaignSubmissions(request({ query: { status: "UNDER_REVIEW" } }), res);

    expect(mocked.listManualCampaignSubmissions).toHaveBeenCalledWith("dave", CAMPAIGN_ID, "UNDER_REVIEW");
    const [underReview, approvedHere, approvedOnChain] = body(res).fulfillments;
    expect(underReview).toEqual(
      expect.objectContaining({
        participant: { id: "alice", name: "Alice", walletAddress: "0xalice" },
        submission: { transactionHash: "0xsub", blockNumber: "7", logIndex: 0 },
        chain: null,
      }),
    );
    expect(approvedHere.chain).toEqual({ functionName: "verifyCampaignFulfillment", args: [bytes32("approved-here")] });
    expect(approvedOnChain.chain).toBeNull();
  });

  test("approving and rejecting return the call that makes the decision final", async () => {
    mocked.approveManualCampaignSubmission.mockResolvedValue({
      campaign: campaign(),
      fulfillment: fulfillment({ status: "APPROVED" }),
    });
    mocked.rejectManualCampaignSubmission.mockResolvedValue({
      campaign: campaign(),
      fulfillment: fulfillment({ status: "REJECTED", rejectionReason: "Wrong profile" }),
    });
    const approved = response();
    const rejected = response();
    const params = { id: CAMPAIGN_ID, fulfillmentId: FULFILLMENT_ID };

    await approveCampaignSubmission(request({ params }), approved);
    await rejectCampaignSubmission(request({ params, body: { reason: "Wrong profile" } }), rejected);

    expect(mocked.approveManualCampaignSubmission).toHaveBeenCalledWith("dave", CAMPAIGN_ID, FULFILLMENT_ID);
    expect(mocked.rejectManualCampaignSubmission).toHaveBeenCalledWith("dave", CAMPAIGN_ID, FULFILLMENT_ID, {
      reason: "Wrong profile",
    });
    expect(body(approved).fulfillment.chain.functionName).toBe("verifyCampaignFulfillment");
    expect(body(rejected).fulfillment).toEqual(
      expect.objectContaining({
        rejectionReason: "Wrong profile",
        chain: { functionName: "rejectCampaignFulfillment", args: [bytes32(FULFILLMENT_ID)] },
      }),
    );
  });
});

describe("public reads", () => {
  const builtin = {
    id: "00000000-0000-4000-8000-000000000001",
    key: "builtin-referral",
    title: "Referral",
    description: "",
    status: "ACTIVE",
    isSystem: true,
    schemaVersion: 1,
    task: {},
  };

  beforeEach(() => {
    (getBuiltinReferralCampaign as jest.Mock).mockResolvedValue(builtin);
    mocked.findManualCampaign.mockResolvedValue(null);
    mocked.listOpenManualCampaigns.mockResolvedValue([]);
  });

  test("the board lists open user campaigns after the built-in one, with spots left", async () => {
    mocked.listOpenManualCampaigns.mockResolvedValue([campaign()]);
    mocked.countSpotsTaken.mockResolvedValue(new Map([["task-1", 3]]));
    const res = response();

    await getCampaigns(request(), res);

    const { campaigns } = body(res);
    expect(campaigns.map((c: any) => c.key)).toEqual(["builtin-referral", CAMPAIGN_ID]);
    expect(campaigns[1]).toEqual(expect.objectContaining({ spotsLeft: 2, owner: { name: "Dave", walletAddress: "0xdave" } }));
    // The board is a summary: instructions and contract calls are not on it
    expect(campaigns[1]).not.toHaveProperty("instructions");
    expect(campaigns[1]).not.toHaveProperty("chain");
  });

  test("a user campaign's detail includes its instructions", async () => {
    mocked.findManualCampaign.mockResolvedValue(campaign());
    const res = response();

    await getCampaign(request({ params: { idOrKey: CAMPAIGN_ID } }), res);

    expect(body(res).campaign).toEqual(expect.objectContaining({ id: CAMPAIGN_ID, instructions: expect.any(String) }));
    expect(body(res).campaign).not.toHaveProperty("chain");
  });

  test("a draft stays hidden from everyone but its creator's own list", async () => {
    mocked.findManualCampaign.mockResolvedValue(campaign({ status: "DRAFT", publishedAt: null }));
    const res = response();

    await getCampaign(request({ params: { idOrKey: CAMPAIGN_ID } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("my fulfillment of a user campaign is my submission, or null", async () => {
    mocked.findManualCampaign.mockResolvedValue(campaign());
    mocked.getMyManualCampaignFulfillment.mockResolvedValueOnce(fulfillment({ status: "UNDER_REVIEW" })).mockResolvedValueOnce(null);
    const mine = response();
    const none = response();

    await getMyCampaignFulfillment(request({ user: { id: "alice" }, params: { idOrKey: CAMPAIGN_ID } }), mine);
    await getMyCampaignFulfillment(request({ user: { id: "bob" }, params: { idOrKey: CAMPAIGN_ID } }), none);

    expect(body(mine).fulfillment).toEqual(expect.objectContaining({ id: FULFILLMENT_ID, status: "UNDER_REVIEW" }));
    expect(body(none)).toEqual({ fulfillment: null });
  });
});

describe("private campaigns", () => {
  const secret = () => campaign({ isPrivate: true, privateCode: "secret-code" });

  beforeEach(() => {
    (getBuiltinReferralCampaign as jest.Mock).mockResolvedValue({ id: "builtin-id", key: "builtin-referral" });
    mocked.findManualCampaign.mockResolvedValue(secret());
    mocked.findPrivateManualCampaign.mockResolvedValue(secret());
    mocked.countSpotsTaken.mockResolvedValue(new Map([["task-1", 1]]));
  });

  test("the link opens the campaign's detail without a login, but never repeats the code", async () => {
    const res = response();

    await getPrivateCampaign(request({ user: undefined, params: { code: "secret-code" } }), res);

    expect(mocked.findPrivateManualCampaign).toHaveBeenCalledWith("secret-code");
    expect(body(res).campaign).toEqual(
      expect.objectContaining({ id: CAMPAIGN_ID, isPrivate: true, instructions: expect.any(String), spotsLeft: 4 }),
    );
    expect(body(res).campaign).not.toHaveProperty("privateCode");
    expect(body(res).campaign).not.toHaveProperty("chain");
  });

  test("an unknown code, or a draft not on chain yet, is a 404", async () => {
    mocked.findPrivateManualCampaign.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...secret(),
      status: "DRAFT",
      publishedAt: null,
    });
    const unknown = response();
    const draft = response();

    await getPrivateCampaign(request({ params: { code: "guess" } }), unknown);
    await getPrivateCampaign(request({ params: { code: "secret-code" } }), draft);

    expect(unknown.status).toHaveBeenCalledWith(404);
    expect(draft.status).toHaveBeenCalledWith(404);
  });

  test("a stored campaign that fails to parse is a 500", async () => {
    mocked.findPrivateManualCampaign.mockRejectedValue(new ManualCampaignDataError(CAMPAIGN_ID, "it has no owner"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const res = response();

    await getPrivateCampaign(request({ params: { code: "secret-code" } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test("its id alone doesn't open it", async () => {
    const res = response();

    await getCampaign(request({ user: undefined, params: { idOrKey: CAMPAIGN_ID } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("my fulfillment answers only its creator and the people who joined it", async () => {
    mocked.getMyManualCampaignFulfillment
      .mockResolvedValueOnce(fulfillment({ status: "UNDER_REVIEW" }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const joined = response();
    const creator = response();
    const stranger = response();

    await getMyCampaignFulfillment(request({ user: { id: "alice" }, params: { idOrKey: CAMPAIGN_ID } }), joined);
    await getMyCampaignFulfillment(request({ user: { id: "dave" }, params: { idOrKey: CAMPAIGN_ID } }), creator);
    await getMyCampaignFulfillment(request({ user: { id: "mallory" }, params: { idOrKey: CAMPAIGN_ID } }), stranger);

    expect(body(joined).fulfillment).toEqual(expect.objectContaining({ id: FULFILLMENT_ID }));
    expect(body(creator)).toEqual({ fulfillment: null });
    expect(stranger.status).toHaveBeenCalledWith(404);
  });
});
