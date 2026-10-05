import {
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { test, expect, type AllocatedWallet, type WalletRole } from "../fixtures";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://api:3001";
const hardhatRpcUrl = process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545";
const contractAddress = (process.env.E2E_REFERRAL_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const hardhatMnemonic = "test test test test test test test test test test test junk";
const referralAbi = parseAbi([
  "function joinProgram()",
  "function createInvite(bytes32 inviteID, address referrer, uint8 status)",
  "function acceptInvite(address referrer, bytes32 inviteId)",
  "function viewPoints(address user) view returns (uint256)",
  "function viewReferrer(address user) view returns (address)",
]);
const publicClient = createPublicClient({ transport: http(hardhatRpcUrl) });

async function authenticate(
  request: APIRequestContext,
  wallet: AllocatedWallet,
  role: WalletRole,
  extra: Record<string, unknown> = {},
): Promise<{ response: APIResponse; message: string }> {
  const message = `Reffinity API integration authentication\nWallet: ${wallet.address}\nRole: ${role}`;
  const signature = await wallet.signMessage(message);
  const response = await request.post(`${apiBaseUrl}/api/auth/wallet`, {
    data: { walletAddress: wallet.address, signature, message, ...extra },
  });
  return { response, message };
}

test.describe("@api real-dependency authentication", () => {
  test("persists a real signed wallet identity and returns it through JWT middleware", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    const wallet = walletFor("primary");
    const first = await authenticate(request, wallet, "primary");
    expect(first.response.ok(), await first.response.text()).toBeTruthy();
    const created = await first.response.json();

    expect(created).toEqual(expect.objectContaining({
      isNewUser: true,
      token: expect.any(String),
      user: expect.objectContaining({
        id: expect.any(String),
        walletAddress: wallet.address.toLowerCase(),
        referralCode: expect.any(String),
      }),
    }));

    const me = await request.get(`${apiBaseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${created.token}` },
    });
    expect(me.ok(), await me.text()).toBeTruthy();
    expect(await me.json()).toEqual({
      user: expect.objectContaining({
        id: created.user.id,
        walletAddress: wallet.address.toLowerCase(),
        referralCode: created.user.referralCode,
      }),
    });

    const second = await authenticate(request, wallet, "primary");
    expect(second.response.ok(), await second.response.text()).toBeTruthy();
    expect(await second.response.json()).toEqual(expect.objectContaining({
      isNewUser: false,
      user: expect.objectContaining({ id: created.user.id }),
    }));
  });

  test("rejects a signature from another wallet without provisioning the claimed identity", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    const signer = walletFor("primary");
    const claimedWallet = walletFor("observer");
    const message = `Invalid cross-wallet signature for ${claimedWallet.address}`;
    const signature = await signer.signMessage(message);

    const rejected = await request.post(`${apiBaseUrl}/api/auth/wallet`, {
      data: { walletAddress: claimedWallet.address, signature, message },
    });
    expect(rejected.status()).toBe(401);
    expect(await rejected.json()).toEqual({ error: "Invalid signature" });

    const valid = await authenticate(request, claimedWallet, "observer");
    expect(valid.response.ok(), await valid.response.text()).toBeTruthy();
    expect(await valid.response.json()).toEqual(expect.objectContaining({ isNewUser: true }));
  });

  test("persists profile changes and serves the two-tier network through authenticated routes", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    const wallet = walletFor("referrer");
    const authenticated = await authenticate(request, wallet, "referrer");
    expect(authenticated.response.ok(), await authenticated.response.text()).toBeTruthy();
    const { token } = await authenticated.response.json();
    const headers = { authorization: `Bearer ${token}` };

    const update = await request.put(`${apiBaseUrl}/api/users/profile`, {
      headers,
      data: {
        name: "Phase Five User",
        email: `phase-five-${wallet.index}@example.test`,
        phone: "+1 416 555 0105",
      },
    });
    expect(update.ok(), await update.text()).toBeTruthy();
    expect(await update.json()).toEqual(expect.objectContaining({
      emailChanged: true,
      user: expect.objectContaining({
        name: "Phase Five User",
        email: `phase-five-${wallet.index}@example.test`,
        phone: "+1 416 555 0105",
      }),
    }));

    const profile = await request.get(`${apiBaseUrl}/api/users/profile`, { headers });
    expect(profile.ok(), await profile.text()).toBeTruthy();
    expect(await profile.json()).toEqual({
      user: expect.objectContaining({
        walletAddress: wallet.address.toLowerCase(),
        name: "Phase Five User",
        email: `phase-five-${wallet.index}@example.test`,
      }),
    });

    const network = await request.get(`${apiBaseUrl}/api/users/referral-network`, { headers });
    expect(network.ok(), await network.text()).toBeTruthy();
    expect(await network.json()).toEqual({
      ancestors: { parent: null, grandparent: null },
      referrals: [],
      totals: {
        level1Count: 0,
        level2Count: 0,
        level1Points: 0,
        level2Points: 0,
      },
    });
  });

  test("projects a real accepted referral into points, invites, rewards, and the two-tier network", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    expect(contractAddress).toMatch(/^0x[0-9a-f]{40}$/i);

    const referrerWallet = walletFor("referrer");
    const refereeWallet = walletFor("referee");
    const referrerAuth = await authenticate(request, referrerWallet, "referrer");
    expect(referrerAuth.response.ok(), await referrerAuth.response.text()).toBeTruthy();
    const referrer = await referrerAuth.response.json();

    const referrerAccount = mnemonicToAccount(hardhatMnemonic, {
      addressIndex: referrerWallet.index,
    });
    expect(referrerAccount.address.toLowerCase()).toBe(referrerWallet.address.toLowerCase());
    const referrerClient = createWalletClient({
      account: referrerAccount,
      transport: http(hardhatRpcUrl),
    });
    const joinHash = await referrerClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "joinProgram",
    });
    expect((await publicClient.waitForTransactionReceipt({ hash: joinHash })).status).toBe("success");

    const refereeAuth = await authenticate(request, refereeWallet, "referee", {
      referralCode: referrer.user.referralCode,
    });
    expect(refereeAuth.response.ok(), await refereeAuth.response.text()).toBeTruthy();
    const referee = await refereeAuth.response.json();
    expect(referee).toEqual(expect.objectContaining({
      isNewUser: true,
      bytesInviteId: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
      referrerWalletAddress: referrerWallet.address.toLowerCase(),
    }));

    const refereeAccount = mnemonicToAccount(hardhatMnemonic, {
      addressIndex: refereeWallet.index,
    });
    const refereeClient = createWalletClient({
      account: refereeAccount,
      transport: http(hardhatRpcUrl),
    });
    const acceptHash = await refereeClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "acceptInvite",
      args: [referrerWallet.address, referee.bytesInviteId],
    });
    expect((await publicClient.waitForTransactionReceipt({ hash: acceptHash })).status).toBe("success");

    await expect.poll(async () => {
      const headers = { authorization: `Bearer ${referrer.token}` };
      const refereeHeaders = { authorization: `Bearer ${referee.token}` };
      const [referrerProfile, refereeProfile, invites, rewards, network] = await Promise.all([
        request.get(`${apiBaseUrl}/api/users/profile`, { headers }),
        request.get(`${apiBaseUrl}/api/users/profile`, { headers: refereeHeaders }),
        request.get(`${apiBaseUrl}/api/users/referrals`, { headers }),
        request.get(`${apiBaseUrl}/api/users/referral-rewards`, { headers }),
        request.get(`${apiBaseUrl}/api/users/referral-network`, { headers }),
      ]);
      if (![referrerProfile, refereeProfile, invites, rewards, network].every((response) => response.ok())) {
        return { ready: false };
      }
      const [referrerBody, refereeBody, inviteBody, rewardBody, networkBody] =
        await Promise.all([
          referrerProfile.json(),
          refereeProfile.json(),
          invites.json(),
          rewards.json(),
          network.json(),
        ]);
      return {
        ready: true,
        referrerPoints: referrerBody.user.earnedPoints,
        refereePoints: refereeBody.user.earnedPoints,
        invite: inviteBody.invites[0]
          ? {
              status: inviteBody.invites[0].status,
              points: inviteBody.invites[0].points,
              isVerified: inviteBody.invites[0].isVerified,
              refereeWallet: inviteBody.invites[0].referee?.walletAddress,
            }
          : null,
        reward: rewardBody.rewardHistory[0]
          ? {
              participant: rewardBody.rewardHistory[0].participant.walletAddress,
              referralLevel: rewardBody.rewardHistory[0].referralLevel,
              points: rewardBody.rewardHistory[0].points,
              pointPool: rewardBody.rewardHistory[0].pointPool,
              source: rewardBody.rewardHistory[0].source,
            }
          : null,
        network: {
          level1Count: networkBody.totals.level1Count,
          level1Points: networkBody.totals.level1Points,
          walletAddress: networkBody.referrals[0]?.walletAddress,
        },
      };
    }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toEqual({
      ready: true,
      referrerPoints: 100,
      refereePoints: 50,
      invite: {
        status: 1,
        points: 100,
        isVerified: true,
        refereeWallet: refereeWallet.address.toLowerCase(),
      },
      reward: {
        participant: refereeWallet.address.toLowerCase(),
        referralLevel: 1,
        points: 100,
        pointPool: 100,
        source: "signup",
      },
      network: {
        level1Count: 1,
        level1Points: 100,
        walletAddress: refereeWallet.address.toLowerCase(),
      },
    });

    expect(await publicClient.readContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "viewPoints",
      args: [referrerWallet.address],
    })).toBe(100n);
    expect(await publicClient.readContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "viewPoints",
      args: [refereeWallet.address],
    })).toBe(50n);
    expect((await publicClient.readContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "viewReferrer",
      args: [refereeWallet.address],
    })).toLowerCase()).toBe(referrerWallet.address.toLowerCase());
  });

  test("catches up events emitted while the listener is stopped without duplicating projections", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    const resetHeaders = { "x-e2e-reset-key": process.env.E2E_RESET_KEY ?? "" };
    const referrerWallet = walletFor("referrer");
    const refereeWallet = walletFor("referee");
    const referrerAuth = await authenticate(request, referrerWallet, "referrer");
    expect(referrerAuth.response.ok(), await referrerAuth.response.text()).toBeTruthy();
    const referrer = await referrerAuth.response.json();

    const referrerClient = createWalletClient({
      account: mnemonicToAccount(hardhatMnemonic, { addressIndex: referrerWallet.index }),
      transport: http(hardhatRpcUrl),
    });
    const joinHash = await referrerClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "joinProgram",
    });
    await publicClient.waitForTransactionReceipt({ hash: joinHash });

    const refereeAuth = await authenticate(request, refereeWallet, "referee", {
      referralCode: referrer.user.referralCode,
    });
    expect(refereeAuth.response.ok(), await refereeAuth.response.text()).toBeTruthy();
    const referee = await refereeAuth.response.json();

    const paused = await request.post(`${apiBaseUrl}/__e2e/listener/pause`, {
      headers: resetHeaders,
    });
    expect(paused.ok(), await paused.text()).toBeTruthy();
    const pausedState = await paused.json();
    expect(pausedState).toEqual(expect.objectContaining({ listening: false }));
    expect((await request.get(`${apiBaseUrl}/ready`)).status()).toBe(503);

    const refereeClient = createWalletClient({
      account: mnemonicToAccount(hardhatMnemonic, { addressIndex: refereeWallet.index }),
      transport: http(hardhatRpcUrl),
    });
    const acceptHash = await refereeClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "acceptInvite",
      args: [referrerWallet.address, referee.bytesInviteId],
    });
    await publicClient.waitForTransactionReceipt({ hash: acceptHash });

    const beforeRestart = await request.get(`${apiBaseUrl}/api/users/profile`, {
      headers: { authorization: `Bearer ${referrer.token}` },
    });
    expect((await beforeRestart.json()).user.earnedPoints).toBe(0);

    const restarted = await request.post(`${apiBaseUrl}/__e2e/listener/restart`, {
      headers: resetHeaders,
    });
    expect(restarted.ok(), await restarted.text()).toBeTruthy();
    const restartedState = await restarted.json();
    expect(restartedState.listening).toBe(true);
    const restartedCursor = [
      restartedState.syncState.lastProcessedBlock,
      restartedState.syncState.lastReferralAllocationBlock,
    ].map(BigInt).reduce((highest, current) => current > highest ? current : highest);
    const pausedCursor = [
      pausedState.syncState.lastProcessedBlock,
      pausedState.syncState.lastReferralAllocationBlock,
    ].map(BigInt).reduce((highest, current) => current > highest ? current : highest);
    expect(restartedCursor).toBeGreaterThan(pausedCursor);

    await expect.poll(async () => {
      const [profile, rewards] = await Promise.all([
        request.get(`${apiBaseUrl}/api/users/profile`, {
          headers: { authorization: `Bearer ${referrer.token}` },
        }),
        request.get(`${apiBaseUrl}/api/users/referral-rewards`, {
          headers: { authorization: `Bearer ${referrer.token}` },
        }),
      ]);
      return {
        points: (await profile.json()).user.earnedPoints,
        rewards: (await rewards.json()).rewardHistory.length,
      };
    }).toEqual({ points: 100, rewards: 1 });

    const secondRestart = await request.post(`${apiBaseUrl}/__e2e/listener/restart`, {
      headers: resetHeaders,
    });
    expect(secondRestart.ok(), await secondRestart.text()).toBeTruthy();
    const rewards = await request.get(`${apiBaseUrl}/api/users/referral-rewards`, {
      headers: { authorization: `Bearer ${referrer.token}` },
    });
    expect((await rewards.json()).rewardHistory).toHaveLength(1);
  });

  test("enforces private-invite ownership, uniqueness, and single use across API, database, and chain", async ({
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    const referrerWallet = walletFor("referrer");
    const refereeWallet = walletFor("referee");
    const observerWallet = walletFor("observer");
    const referrerAuth = await authenticate(request, referrerWallet, "referrer");
    expect(referrerAuth.response.ok(), await referrerAuth.response.text()).toBeTruthy();
    const referrer = await referrerAuth.response.json();
    const referrerClient = createWalletClient({
      account: mnemonicToAccount(hardhatMnemonic, { addressIndex: referrerWallet.index }),
      transport: http(hardhatRpcUrl),
    });
    const joinHash = await referrerClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "joinProgram",
    });
    await publicClient.waitForTransactionReceipt({ hash: joinHash });

    const privateResponse = await request.post(`${apiBaseUrl}/api/users/referrals/private`, {
      headers: { authorization: `Bearer ${referrer.token}` },
      data: { description: "Single-use integration invite" },
    });
    expect(privateResponse.ok(), await privateResponse.text()).toBeTruthy();
    const privateInvite = await privateResponse.json();
    expect(privateInvite).toEqual(expect.objectContaining({
      inviteCode: expect.any(String),
      bytesinviteId: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
    }));

    const createHash = await referrerClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "createInvite",
      args: [privateInvite.bytesinviteId, referrerWallet.address, 0],
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    const refereeAuth = await authenticate(request, refereeWallet, "referee", {
      referralCode: referrer.user.referralCode,
      inviteCode: privateInvite.inviteCode,
    });
    expect(refereeAuth.response.ok(), await refereeAuth.response.text()).toBeTruthy();
    const referee = await refereeAuth.response.json();
    expect(referee.bytesInviteId).toBe(privateInvite.bytesinviteId);

    const refereeClient = createWalletClient({
      account: mnemonicToAccount(hardhatMnemonic, { addressIndex: refereeWallet.index }),
      transport: http(hardhatRpcUrl),
    });
    const acceptHash = await refereeClient.writeContract({
      address: contractAddress,
      abi: referralAbi,
      functionName: "acceptInvite",
      args: [referrerWallet.address, privateInvite.bytesinviteId],
    });
    await publicClient.waitForTransactionReceipt({ hash: acceptHash });

    await expect.poll(async () => {
      const invites = await request.get(`${apiBaseUrl}/api/users/referrals`, {
        headers: { authorization: `Bearer ${referrer.token}` },
      });
      const body = await invites.json();
      return body.invites.map((invite: any) => ({
        id: invite.id,
        status: invite.status,
        referee: invite.referee?.walletAddress,
      }));
    }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toContainEqual({
      id: privateInvite.bytesinviteId.replace(/^0x/, "").replace(
        /^(........)(....)(....)(....)(............).*$/,
        "$1-$2-$3-$4-$5",
      ),
      status: 1,
      referee: refereeWallet.address.toLowerCase(),
    });

    const replay = await authenticate(request, observerWallet, "observer", {
      referralCode: referrer.user.referralCode,
      inviteCode: privateInvite.inviteCode,
    });
    expect(replay.response.status()).toBe(409);
    expect(await replay.response.json()).toEqual({
      error: "Private invite is invalid or has already been used",
    });

    const observerFresh = await authenticate(request, observerWallet, "observer");
    expect(observerFresh.response.ok(), await observerFresh.response.text()).toBeTruthy();
    expect((await observerFresh.response.json()).isNewUser).toBe(true);
  });
});
