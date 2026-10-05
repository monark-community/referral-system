import { type APIRequestContext, type Page } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  test,
  expect,
  type AllocatedWallet,
  type WalletRole,
} from "../fixtures";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://api:3001";
const rpcUrl = process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545";
const contractAddress = process.env.E2E_REFERRAL_CONTRACT_ADDRESS as `0x${string}`;
const mnemonic = "test test test test test test test test test test test junk";
const mailboxHeaders = { "x-e2e-mailbox-key": process.env.E2E_MAILBOX_KEY ?? "" };
const abi = parseAbi([
  "function joinProgram()",
  "function createInvite(bytes32 inviteID, address referrer, uint8 status)",
  "function acceptInvite(address referrer, bytes32 inviteId)",
  "function viewPoints(address user) view returns (uint256)",
  "function viewReferrer(address user) view returns (address)",
]);
const publicClient = createPublicClient({ transport: http(rpcUrl) });

async function authenticate(
  request: APIRequestContext,
  wallet: AllocatedWallet,
  role: WalletRole,
  extra: Record<string, unknown> = {},
) {
  const message = `Phase 6 authentication\nWallet: ${wallet.address}\nRole: ${role}`;
  const signature = await wallet.signMessage(message);
  const response = await request.post(`${apiBaseUrl}/api/auth/wallet`, {
    data: { walletAddress: wallet.address, signature, message, ...extra },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function walletClient(wallet: AllocatedWallet) {
  return createWalletClient({
    account: mnemonicToAccount(mnemonic, { addressIndex: wallet.index }),
    transport: http(rpcUrl),
  });
}

async function writeAndWait(client: ReturnType<typeof walletClient>, parameters: any) {
  const hash = await client.writeContract({ address: contractAddress, abi, ...parameters });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return hash;
}

async function connectAndSign(page: Page) {
  const connect = page.getByRole("button", { name: "Connect Test Wallet" });
  if (await connect.isVisible()) await connect.click();
  await page.getByRole("button", { name: "Sign & Continue" }).click();
}

async function completeUiOnboarding(
  page: Page,
  request: APIRequestContext,
  { name, email }: { name: string; email: string },
) {
  await connectAndSign(page);
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Email Verification" })).toBeVisible();

  await expect.poll(async () => {
    const mailbox = await request.get(`${apiBaseUrl}/__e2e/emails?to=${encodeURIComponent(email)}`, {
      headers: mailboxHeaders,
    });
    if (!mailbox.ok()) return undefined;
    return (await mailbox.json()).messages?.[0]?.verificationUrl as string | undefined;
  }).toBeTruthy();

  // expect.poll asserts the value but does not return it, so read the now-populated mailbox once.
  const mailbox = await request.get(`${apiBaseUrl}/__e2e/emails?to=${encodeURIComponent(email)}`, {
    headers: mailboxHeaders,
  });
  const messages = (await mailbox.json()).messages;
  expect(messages).toHaveLength(1);
  await page.goto(messages[0].verificationUrl);
  await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
  await expect(page).toHaveURL(/\/referrals$/);
  await expect(page.getByText("Invite Friends")).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  const profile = await request.get(`${apiBaseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  return { token: token!, user: (await profile.json()).user };
}

async function createJoinedUser(
  request: APIRequestContext,
  wallet: AllocatedWallet,
  role: WalletRole,
  name: string,
) {
  const auth = await authenticate(request, wallet, role);
  await request.put(`${apiBaseUrl}/api/users/profile`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name },
  });
  await writeAndWait(walletClient(wallet), { functionName: "joinProgram" });
  return auth;
}

async function acceptReferral(
  request: APIRequestContext,
  wallet: AllocatedWallet,
  role: WalletRole,
  referrer: { user: { referralCode: string }; wallet: AllocatedWallet },
  name: string,
) {
  const auth = await authenticate(request, wallet, role, {
    referralCode: referrer.user.referralCode,
  });
  await request.put(`${apiBaseUrl}/api/users/profile`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name },
  });
  await writeAndWait(walletClient(wallet), {
    functionName: "acceptInvite",
    args: [referrer.wallet.address, auth.bytesInviteId],
  });
  return auth;
}

test.describe("@phase6 core browser journeys", () => {
  test("new user completes onboarding and verifies email through the local mailbox", async ({
    page,
    request,
    beginFullOnboarding,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    await beginFullOnboarding(page, "primary");
    await connectAndSign(page);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Name").fill("Phase Six New User");
    await page.getByLabel("Email").fill("phase-six-new@example.test");
    await page.getByLabel("Phone (optional)").fill("+1 416 555 0160");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Email Verification" })).toBeVisible();

    const mailbox = await request.get(`${apiBaseUrl}/__e2e/emails?to=phase-six-new@example.test`, {
      headers: mailboxHeaders,
    });
    expect(mailbox.ok(), await mailbox.text()).toBeTruthy();
    const messages = (await mailbox.json()).messages;
    expect(messages).toHaveLength(1);

    await page.goto(messages[0].verificationUrl);
    await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();
    await page.getByRole("button", { name: "Go to Dashboard" }).click();
    await expect(page).toHaveURL(/\/referrals$/);
    await expect(page.getByText("Invite Friends")).toBeVisible();
  });

  test("returning user signs in and skips completed onboarding", async ({
    page,
    request,
    walletFor,
    cleanBaseline: _cleanBaseline,
  }) => {
    const wallet = walletFor("primary");
    await createJoinedUser(request, wallet, "primary", "Returning User");
    await page.addInitScript(({ index }) => {
      localStorage.setItem("reffinity:e2e-wallet-index", String(index));
    }, { index: wallet.index });
    await page.goto("/referrals/welcome");
    await page.getByRole("button", { name: "Login" }).click();
    const connect = page.getByRole("button", { name: "Connect Test Wallet" });
    if (await connect.isVisible()) await connect.click();
    await page.getByRole("button", { name: "Sign & Login" }).click();
    await expect(page).toHaveURL(/\/referrals$/);
    await expect(page.getByText("Invite Friends")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toHaveCount(0);
  });

  test("@smoke public referral onboards both users and appears in UI, API, and contract state", async ({
    page,
    request,
    walletFor,
    createUserContext,
    beginFullOnboarding,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    const referrerWallet = walletFor("referrer");
    const refereeWallet = walletFor("referee");

    await beginFullOnboarding(page, "referrer");
    const referrer = await completeUiOnboarding(page, request, {
      name: "Public Referrer",
      email: "smoke-referrer@example.test",
    });

    const refereeBrowser = await createUserContext("referee");
    await refereeBrowser.page.goto(`/invite/${referrer.user.referralCode}`);
    await expect(refereeBrowser.page).toHaveURL(/\/referrals\/welcome$/);
    await refereeBrowser.page.getByRole("button", { name: "Join the Program" }).click();
    await completeUiOnboarding(refereeBrowser.page, request, {
      name: "Public Referee",
      email: "smoke-referee@example.test",
    });

    await expect.poll(async () => {
      const network = await request.get(`${apiBaseUrl}/api/users/referral-network`, {
        headers: { authorization: `Bearer ${referrer.token}` },
      });
      return (await network.json()).totals;
    }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toEqual(
      expect.objectContaining({ level1Count: 1, level1Points: 100 }),
    );

    expect(await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "viewReferrer",
      args: [refereeWallet.address],
    })).toBe(referrerWallet.address);

    await page.goto("/referrals/history");
    await expect(page.getByText("Level 1")).toBeVisible();
    await expect(page.getByText("100 Points Earned")).toBeVisible();
  });

  test("private invite can be consumed once and reuse is rejected in the browser", async ({
    request,
    walletFor,
    createUserContext,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    const referrerWallet = walletFor("referrer");
    const referrer = await createJoinedUser(
      request,
      referrerWallet,
      "referrer",
      "Private Referrer",
    );
    const privateResponse = await request.post(`${apiBaseUrl}/api/users/referrals/private`, {
      headers: { authorization: `Bearer ${referrer.token}` },
      data: { description: "Phase 6 private invite" },
    });
    const privateInvite = await privateResponse.json();
    await writeAndWait(walletClient(referrerWallet), {
      functionName: "createInvite",
      args: [privateInvite.bytesinviteId, referrerWallet.address, 0],
    });

    const first = await createUserContext("referee");
    await first.page.goto(`/invite/${referrer.user.referralCode}-${privateInvite.inviteCode}`);
    await first.page.getByRole("button", { name: "Join the Program" }).click();
    await connectAndSign(first.page);
    await expect(first.page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    const replay = await createUserContext("observer");
    await replay.page.goto(`/invite/${referrer.user.referralCode}-${privateInvite.inviteCode}`);
    await replay.page.getByRole("button", { name: "Join the Program" }).click();
    await connectAndSign(replay.page);
    await expect(replay.page.getByText("Private invite is invalid or has already been used")).toBeVisible();
    expect(await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "viewReferrer",
      args: [walletFor("referee").address],
    })).toBe(referrerWallet.address);
  });

  test("multi-level referral displays direct and level-two rewards", async ({
    request,
    walletFor,
    createAuthenticatedContext,
    cleanBaseline: _cleanBaseline,
  }) => {
    test.slow();
    const grandparentWallet = walletFor("primary");
    const parentWallet = walletFor("referrer");
    const childWallet = walletFor("referee");
    const grandparent = await createJoinedUser(
      request,
      grandparentWallet,
      "primary",
      "Grandparent User",
    );
    const parent = await acceptReferral(
      request,
      parentWallet,
      "referrer",
      { user: grandparent.user, wallet: grandparentWallet },
      "Parent User",
    );
    await acceptReferral(
      request,
      childWallet,
      "referee",
      { user: parent.user, wallet: parentWallet },
      "Child User",
    );

    await expect.poll(async () => {
      const network = await request.get(`${apiBaseUrl}/api/users/referral-network`, {
        headers: { authorization: `Bearer ${grandparent.token}` },
      });
      return (await network.json()).totals;
    }, { timeout: 25_000, intervals: [500, 1_000, 2_000] }).toEqual({
      level1Count: 1,
      level2Count: 1,
      level1Points: 100,
      level2Points: 20,
    });

    const browser = await createAuthenticatedContext("primary");
    await browser.page.goto("/referrals/history");
    await expect(browser.page.getByText("Level 1")).toBeVisible();
    await expect(browser.page.getByText("Level 2")).toBeVisible();
    await expect(browser.page.getByText("20 Points Earned")).toBeVisible();
    expect(await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName: "viewPoints",
      args: [grandparentWallet.address],
    })).toBe(120n);
  });
});
