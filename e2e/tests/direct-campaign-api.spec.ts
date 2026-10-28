import type { APIRequestContext } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { test, expect, type AllocatedWallet, type WalletRole } from "../fixtures";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://api:3001";
const rpcUrl = process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545";
const contractAddress = process.env.E2E_REFERRAL_CONTRACT_ADDRESS as `0x${string}`;
const mnemonic = "test test test test test test test test test test test junk";
const publicClient = createPublicClient({ transport: http(rpcUrl) });
const referralAbi = parseAbi([
  "function createCampaign(bytes32 campaignId,uint8 taskType,uint8 verificationType,uint8 rewardType,uint256 completerReward,uint256 referralPool) payable",
  "function getCampaign(bytes32 campaignId) view returns (bytes32 id,address owner,uint8 taskType,uint8 verificationType,uint8 status,uint8 rewardType,uint256 completerReward,uint256 referralPool,uint256 balance)",
  "function fundCampaign(bytes32 campaignId) payable",
  "function submitCampaignFulfillment(bytes32 campaignId,bytes32 fulfillmentId)",
  "function verifyCampaignFulfillment(bytes32 fulfillmentId)",
  "function withdrawDirectRewards(address destination)",
]);

async function authenticate(request: APIRequestContext, wallet: AllocatedWallet, role: WalletRole) {
  const message = `Direct campaign authentication\nWallet: ${wallet.address}\nRole: ${role}`;
  const response = await request.post(`${apiBaseUrl}/api/auth/wallet`, {
    data: { walletAddress: wallet.address, signature: await wallet.signMessage(message), message },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ token: string }>;
}

const headers = (token: string) => ({ authorization: `Bearer ${token}` });

test("@api creates, funds, settles, reads, and withdraws a Direct campaign without frontend code", async ({
  request,
  walletFor,
  cleanBaseline: _cleanBaseline,
}) => {
  test.slow();
  const creatorWallet = walletFor("primary");
  const participantWallet = walletFor("observer");
  const creatorAuth = await authenticate(request, creatorWallet, "primary");
  const participantAuth = await authenticate(request, participantWallet, "observer");
  const creator = createWalletClient({
    account: mnemonicToAccount(mnemonic, { addressIndex: creatorWallet.index }),
    transport: http(rpcUrl),
  });
  const participant = createWalletClient({
    account: mnemonicToAccount(mnemonic, { addressIndex: participantWallet.index }),
    transport: http(rpcUrl),
  });

  const draftResponse = await request.post(`${apiBaseUrl}/api/campaigns`, {
    headers: headers(creatorAuth.token),
    data: {
      title: "Direct API campaign",
      instructions: "Publish the requested post and submit its URL.",
      category: "SOCIAL_MEDIA",
      rewardType: "DIRECT",
      completerRewardWei: "30",
      referralPoolWei: "10",
      initialFundingRuns: 10,
      maxCompletions: 50,
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(draftResponse.status(), await draftResponse.text()).toBe(201);
  const { campaign: draft } = await draftResponse.json();
  expect(draft.reward.initialFundingWei).toBe("400");
  expect(draft.chain.valueWei).toBe("400");

  const createHash = await creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "createCampaign",
    args: [draft.chain.args[0] as Hex, 1, 1, 1, 30n, 10n],
    value: 400n,
  });
  expect((await publicClient.waitForTransactionReceipt({ hash: createHash })).status).toBe("success");

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}`);
    return response.ok() ? (await response.json()).campaign.reward.chainBalanceWei : null;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("400");

  const chainCampaign = await publicClient.readContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "getCampaign",
    args: [draft.chain.args[0] as Hex],
  }) as readonly [Hex, `0x${string}`, number, number, number, number, bigint, bigint, bigint];
  expect(chainCampaign[8] / (chainCampaign[6] + chainCampaign[7])).toBe(10n);

  const submitted = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
    headers: headers(participantAuth.token),
    data: { proof: "https://example.com/direct-proof" },
  });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const { fulfillment } = await submitted.json();
  const submitHash = await participant.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "submitCampaignFulfillment",
    args: fulfillment.chain.args as [Hex, Hex],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
      headers: headers(creatorAuth.token),
    });
    return response.ok() ? (await response.json()).fulfillments[0]?.status : null;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("UNDER_REVIEW");

  const approved = await request.post(
    `${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments/${fulfillment.id}/approve`,
    { headers: headers(creatorAuth.token) },
  );
  expect(approved.ok(), await approved.text()).toBeTruthy();
  const approval = (await approved.json()).fulfillment;
  const approveHash = await creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "verifyCampaignFulfillment",
    args: approval.chain.args as [Hex],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/rewards/direct/me`, {
      headers: headers(participantAuth.token),
    });
    return response.ok() ? (await response.json()).balanceWei : null;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("30");

  const withdrawalResponse = await request.post(`${apiBaseUrl}/api/campaigns/rewards/direct/withdraw`, {
    headers: headers(participantAuth.token),
    data: {},
  });
  expect(withdrawalResponse.ok(), await withdrawalResponse.text()).toBeTruthy();
  const withdrawal = await withdrawalResponse.json();
  const withdrawHash = await participant.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "withdrawDirectRewards",
    args: withdrawal.chain.args as [`0x${string}`],
  });
  await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/rewards/direct/me`, {
      headers: headers(participantAuth.token),
    });
    return (await response.json()).balanceWei;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("0");
});

test("@api a one-run Direct campaign blocks while empty and reopens after a signed top-up", async ({
  request,
  walletFor,
  cleanBaseline: _cleanBaseline,
}) => {
  test.slow();
  const creatorWallet = walletFor("primary");
  const participantWallet = walletFor("observer");
  const nextParticipantWallet = walletFor("referee");
  const creatorAuth = await authenticate(request, creatorWallet, "primary");
  const participantAuth = await authenticate(request, participantWallet, "observer");
  const nextParticipantAuth = await authenticate(request, nextParticipantWallet, "referee");
  const creator = createWalletClient({
    account: mnemonicToAccount(mnemonic, { addressIndex: creatorWallet.index }),
    transport: http(rpcUrl),
  });
  const participant = createWalletClient({
    account: mnemonicToAccount(mnemonic, { addressIndex: participantWallet.index }),
    transport: http(rpcUrl),
  });

  const draftResponse = await request.post(`${apiBaseUrl}/api/campaigns`, {
    headers: headers(creatorAuth.token),
    data: {
      title: "One-run Direct campaign",
      instructions: "Submit proof once per funded run.",
      category: "SOCIAL_MEDIA",
      rewardType: "DIRECT",
      completerRewardWei: "30",
      referralPoolWei: "10",
      initialFundingRuns: 1,
      maxCompletions: 20,
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(draftResponse.status(), await draftResponse.text()).toBe(201);
  const { campaign: draft } = await draftResponse.json();
  expect(draft.chain.valueWei).toBe("40");
  const campaignBytes = draft.chain.args[0] as Hex;

  const createHash = await creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "createCampaign",
    args: [campaignBytes, 1, 1, 1, 30n, 10n],
    value: 40n,
  });
  await publicClient.waitForTransactionReceipt({ hash: createHash });
  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}`);
    return response.ok() ? (await response.json()).campaign.reward.chainStatus : null;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("ACTIVE");

  const submitted = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
    headers: headers(participantAuth.token),
    data: { proof: "https://example.com/one-run-proof" },
  });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const { fulfillment } = await submitted.json();
  const submitHash = await participant.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "submitCampaignFulfillment",
    args: fulfillment.chain.args as [Hex, Hex],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });
  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
      headers: headers(creatorAuth.token),
    });
    return response.ok() ? (await response.json()).fulfillments[0]?.status : null;
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toBe("UNDER_REVIEW");

  const approved = await request.post(
    `${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments/${fulfillment.id}/approve`,
    { headers: headers(creatorAuth.token) },
  );
  expect(approved.ok(), await approved.text()).toBeTruthy();
  const approval = (await approved.json()).fulfillment;
  const approveHash = await creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "verifyCampaignFulfillment",
    args: approval.chain.args as [Hex],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}`);
    if (!response.ok()) return null;
    const reward = (await response.json()).campaign.reward;
    return { balanceWei: reward.chainBalanceWei, status: reward.chainStatus };
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toEqual({
    balanceWei: "10",
    status: "PENDING_FUNDING",
  });

  const blocked = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
    headers: headers(nextParticipantAuth.token),
    data: { proof: "https://example.com/blocked-proof" },
  });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toEqual(expect.objectContaining({ code: "INSUFFICIENT_FUNDING" }));

  const fundingResponse = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/funding`, {
    headers: headers(creatorAuth.token),
    data: { runs: 1 },
  });
  expect(fundingResponse.ok(), await fundingResponse.text()).toBeTruthy();
  const funding = await fundingResponse.json();
  expect(funding).toEqual(expect.objectContaining({
    funding: expect.objectContaining({
      requestedRuns: 1,
      valueWei: "40",
      currentBalanceWei: "10",
      currentRunsRemaining: 0,
      projectedBalanceWei: "50",
      projectedRunsRemaining: 1,
    }),
    chain: expect.objectContaining({ functionName: "fundCampaign", valueWei: "40" }),
  }));
  const fundingHash = await creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "fundCampaign",
    args: funding.chain.args as [Hex],
    value: 40n,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundingHash });

  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}`);
    if (!response.ok()) return null;
    const reward = (await response.json()).campaign.reward;
    return { balanceWei: reward.chainBalanceWei, status: reward.chainStatus };
  }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toEqual({
    balanceWei: "50",
    status: "ACTIVE",
  });

  const reopened = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
    headers: headers(nextParticipantAuth.token),
    data: { proof: "https://example.com/reopened-proof" },
  });
  expect(reopened.status(), await reopened.text()).toBe(201);
});
