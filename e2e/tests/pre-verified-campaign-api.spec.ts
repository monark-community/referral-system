// Purpose: Runs a pre-verified campaign end to end on the real contract, API and listener, without frontend code
// Notes:
// - The creator lists two wallets with the draft. One has an account; the other has none until it signs in to claim
// - The campaign funds one run, so the second winner waits for a top-up, the way funding works today
// - A wallet that isn't listed can't claim someone else's entry: the contract checks the sender

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
  "function createCampaignWithVisibility(bytes32 campaignId,uint8 taskType,uint8 verificationType,uint8 rewardType,uint256 completerReward,uint256 referralPool,uint8 visibility) payable",
  "function createPreVerifiedCampaignFulfillment(bytes32 campaignId,bytes32 fulfillmentId,address participant)",
  "function completePreVerifiedCampaignFulfillment(bytes32 fulfillmentId)",
  "function fundCampaign(bytes32 campaignId) payable",
]);
const poll = { timeout: 25_000, intervals: [500, 1_000, 2_000] };

async function authenticate(request: APIRequestContext, wallet: AllocatedWallet, role: WalletRole) {
  const message = `Pre-verified campaign authentication\nWallet: ${wallet.address}\nRole: ${role}`;
  const response = await request.post(`${apiBaseUrl}/api/auth/wallet`, {
    data: { walletAddress: wallet.address, signature: await wallet.signMessage(message), message },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ token: string }>;
}

const headers = (token: string) => ({ authorization: `Bearer ${token}` });

test("@api a creator lists winners beforehand, and only those wallets claim, with or without an account", async ({
  request,
  walletFor,
  cleanBaseline: _cleanBaseline,
}) => {
  test.slow();
  const creatorWallet = walletFor("primary");
  const aliceWallet = walletFor("observer");
  const bobWallet = walletFor("referee");
  const outsiderWallet = walletFor("referrer");
  const client = (wallet: AllocatedWallet) =>
    createWalletClient({ account: mnemonicToAccount(mnemonic, { addressIndex: wallet.index }), transport: http(rpcUrl) });
  const creator = client(creatorWallet);
  const alice = client(aliceWallet);
  const bob = client(bobWallet);
  const outsider = client(outsiderWallet);
  const send = async (hash: Promise<Hex>) =>
    expect((await publicClient.waitForTransactionReceipt({ hash: await hash })).status).toBe("success");

  // Bob has no account: only the creator, Alice and the outsider sign in for now
  const creatorAuth = await authenticate(request, creatorWallet, "primary");
  const aliceAuth = await authenticate(request, aliceWallet, "observer");
  const outsiderAuth = await authenticate(request, outsiderWallet, "referrer");

  // The draft carries its list; one funded run for two winners
  const draftResponse = await request.post(`${apiBaseUrl}/api/campaigns`, {
    headers: headers(creatorAuth.token),
    data: {
      title: "Photo contest",
      instructions: "The best photos, picked on our page, win.",
      category: "COMMUNITY",
      rewardType: "DIRECT",
      completerRewardWei: "30",
      referralPoolWei: "10",
      initialFundingRuns: 1,
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isPrivate: true,
      verificationType: "PRE_VERIFIED",
      winners: [
        { walletAddress: aliceWallet.address, label: "First place" },
        { walletAddress: bobWallet.address.toLowerCase() },
      ],
    },
  });
  expect(draftResponse.status(), await draftResponse.text()).toBe(201);
  const { campaign: draft } = await draftResponse.json();
  expect(draft).toEqual(expect.objectContaining({ verificationType: "PRE_VERIFIED", isPrivate: true, maxCompletions: 2 }));
  expect(draft.chain).toEqual(expect.objectContaining({ functionName: "createCampaignWithVisibility", valueWei: "40" }));
  const [campaignBytes, taskType, verificationType, rewardType, completer, pool, visibility] = draft.chain.args;
  expect([taskType, verificationType, rewardType, visibility]).toEqual([1, 2, 1, 1]);

  const winnersOf = async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}/winners`, { headers: headers(creatorAuth.token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  expect((await winnersOf()).winners.map((winner: { state: string }) => winner.state)).toEqual(["NOT_PUBLISHED", "NOT_PUBLISHED"]);

  await send(creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "createCampaignWithVisibility",
    args: [campaignBytes as Hex, taskType, verificationType, rewardType, BigInt(completer), BigInt(pool), visibility],
    value: 40n,
  }));

  // Once the listener sees it, each listed wallet is ready to go on chain
  await expect.poll(async () => (await winnersOf()).winners.map((winner: { state: string }) => winner.state), poll)
    .toEqual(["READY_TO_PUT_ON_CHAIN", "READY_TO_PUT_ON_CHAIN"]);
  const listed = await winnersOf();
  expect(listed.funding).toEqual(expect.objectContaining({ runsRemaining: 1, unpaidWinners: 2, runsShort: 1, topUpWei: "40" }));

  // It takes no proof, even from someone with the link
  const proof = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/fulfillments`, {
    headers: headers(aliceAuth.token),
    data: { code: draft.privateCode, proof: "my photo" },
  });
  expect(proof.status()).toBe(409);
  expect(await proof.json()).toEqual(expect.objectContaining({ code: "NOT_ACCEPTING_SUBMISSIONS" }));

  // The creator's wallet puts each listed wallet on chain
  for (const winner of listed.winners) {
    expect(winner.chain.functionName).toBe("createPreVerifiedCampaignFulfillment");
    await send(creator.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "createPreVerifiedCampaignFulfillment",
      args: winner.chain.args as [Hex, Hex, `0x${string}`],
    }));
  }
  await expect.poll(async () => (await winnersOf()).winners.map((winner: { status: string }) => winner.status), poll)
    .toEqual(["RESERVED", "RESERVED"]);

  // Alice sees her claim; the outsider has no entry
  const aliceEntry = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}/winners/me`, { headers: headers(aliceAuth.token) });
  expect(aliceEntry.ok(), await aliceEntry.text()).toBeTruthy();
  const { winner: aliceWinner } = await aliceEntry.json();
  expect(aliceWinner).toEqual(expect.objectContaining({ state: "CLAIMABLE", walletAddress: aliceWallet.address }));
  expect(aliceWinner).not.toHaveProperty("label");
  const outsiderEntry = await request.get(`${apiBaseUrl}/api/campaigns/${draft.id}/winners/me`, { headers: headers(outsiderAuth.token) });
  expect(outsiderEntry.status()).toBe(404);

  // Even with Alice's claim call in hand, another wallet can't claim it
  await expect(outsider.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "completePreVerifiedCampaignFulfillment",
    args: aliceWinner.chain.args as [Hex],
  })).rejects.toThrow();

  await send(alice.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "completePreVerifiedCampaignFulfillment",
    args: aliceWinner.chain.args as [Hex],
  }));
  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/rewards/direct/me`, { headers: headers(aliceAuth.token) });
    return response.ok() ? (await response.json()).balanceWei : null;
  }, poll).toBe("30");

  // Bob signs in for the first time, which makes his account, and finds his reward waiting for funds
  const bobAuth = await authenticate(request, bobWallet, "referee");
  const bobRewards = async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/rewards/pre-verified/me`, { headers: headers(bobAuth.token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).rewards;
  };
  await expect.poll(async () => (await bobRewards()).map((reward: { winner: { state: string } }) => reward.winner.state), poll)
    .toEqual(["WAITING_FOR_FUNDS"]);
  expect((await bobRewards())[0].winner.chain).toBeNull();

  // The creator tops up one run, and Bob can claim
  const fundingResponse = await request.post(`${apiBaseUrl}/api/campaigns/${draft.id}/funding`, {
    headers: headers(creatorAuth.token),
    data: { runs: 1 },
  });
  expect(fundingResponse.ok(), await fundingResponse.text()).toBeTruthy();
  const funding = await fundingResponse.json();
  await send(creator.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "fundCampaign",
    args: funding.chain.args as [Hex],
    value: BigInt(funding.chain.valueWei),
  }));
  await expect.poll(async () => (await bobRewards())[0].winner.state, poll).toBe("CLAIMABLE");

  const [bobReward] = await bobRewards();
  expect(bobReward.campaign).toEqual(expect.objectContaining({ id: draft.id, verificationType: "PRE_VERIFIED" }));
  expect(bobReward.campaign).not.toHaveProperty("privateCode");
  await send(bob.writeContract({
    address: contractAddress,
    abi: referralAbi,
    functionName: "completePreVerifiedCampaignFulfillment",
    args: bobReward.winner.chain.args as [Hex],
  }));
  await expect.poll(async () => {
    const response = await request.get(`${apiBaseUrl}/api/campaigns/rewards/direct/me`, { headers: headers(bobAuth.token) });
    return response.ok() ? (await response.json()).balanceWei : null;
  }, poll).toBe("30");

  // Both listed wallets are paid, and the creator's list shows it
  await expect.poll(async () => (await winnersOf()).winners.map((winner: { status: string; state: string }) => [winner.status, winner.state]), poll)
    .toEqual([["REWARDED", "CLAIMED"], ["REWARDED", "CLAIMED"]]);
  const paid = await winnersOf();
  expect(paid.winners.map((winner: { completerReward: string }) => winner.completerReward)).toEqual(["30", "30"]);
});
