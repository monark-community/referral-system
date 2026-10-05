import { test, expect } from "../fixtures";

test("deterministic wallet connects, authenticates, and broadcasts joinProgram", async ({
  page,
  beginFullOnboarding,
  cleanBaseline: _cleanBaseline,
}) => {
  const wallet = await beginFullOnboarding(page);

  const connectButton = page.getByRole("button", { name: "Connect Test Wallet" });
  if (await connectButton.isVisible()) await connectButton.click();
  await expect(page.getByText(`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`)).toBeVisible();
  await page.getByRole("button", { name: "Sign & Continue" }).click();

  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();

  const calls = await page.evaluate(() => (window as any).__REFFINITY_E2E_WALLET__?.calls ?? []);
  const connectionCall = calls.find((call) => ["eth_accounts", "eth_requestAccounts", "wallet_requestPermissions"].includes(call.method));
  expect(connectionCall?.result.map((address: string) => address.toLowerCase())).toContain(wallet.address.toLowerCase());
  const signatureCall = calls.find((call) => call.method === "personal_sign");
  expect(signatureCall?.params).toEqual(expect.arrayContaining([expect.stringMatching(/^0x/)]));
  expect(signatureCall?.result).toMatch(/^0x[0-9a-f]{130}$/i);
  const switchCall = calls.find((call) => call.method === "wallet_switchEthereumChain");
  expect(switchCall).toEqual(expect.objectContaining({
    params: [{ chainId: "0x7a69" }],
    result: null,
  }));
  const transactionCall = calls.find((call) => call.method === "eth_sendTransaction");
  expect(transactionCall?.params).toEqual(expect.arrayContaining([expect.objectContaining({ from: expect.any(String) })]));
  expect(transactionCall.params[0].from.toLowerCase()).toBe(wallet.address.toLowerCase());
  expect(transactionCall?.result).toMatch(/^0x[0-9a-f]{64}$/i);

  const receiptResponse = await page.request.post(process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545", {
    data: { jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [transactionCall?.result] },
  });
  const receipt = await receiptResponse.json();
  expect(receipt.result).toEqual(expect.objectContaining({ status: "0x1", from: wallet.address.toLowerCase() }));
});

test("disconnected and rejected-signature states are recoverable through the onboarding UI", async ({
  page,
  beginFullOnboarding,
  cleanBaseline: _cleanBaseline,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("reffinity:e2e-wallet-reject-method", "eth_accounts");
  });
  await beginFullOnboarding(page, "observer");
  await expect(page.getByRole("button", { name: "Connect Test Wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign & Continue" })).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("reffinity:e2e-wallet-reject-method");
  });
  await page.getByRole("button", { name: "Connect Test Wallet" }).click();
  await page.evaluate(() => {
    localStorage.setItem("reffinity:e2e-wallet-reject-method", "personal_sign");
  });
  await page.getByRole("button", { name: "Sign & Continue" }).click();
  await expect(page.getByText("Signature request was rejected. Please try again.")).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("reffinity:e2e-wallet-reject-method");
  });
  await page.getByRole("button", { name: "Sign & Continue" }).click();
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});

test("wallet rejection is returned at the provider boundary", async ({ page, beginFullOnboarding }) => {
  await beginFullOnboarding(page, "observer");
  const boundary = await page.evaluate(async () => {
    const wallet = (window as any).__REFFINITY_E2E_WALLET__;
    wallet.clear();
    const switchResult = await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }] });
    localStorage.setItem("reffinity:e2e-wallet-reject-method", "personal_sign");
    let rejection;
    try {
      await wallet.request({ method: "personal_sign", params: ["0x74657374", "0x0000000000000000000000000000000000000000"] });
    } catch (error) {
      rejection = { code: (error as any).code, message: (error as Error).message };
    }
    return { switchResult, rejection, calls: wallet.calls };
  });

  expect(boundary.switchResult).toBeNull();
  expect(boundary.calls[0]).toEqual(expect.objectContaining({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x7a69" }],
    result: null,
  }));
  expect(boundary.rejection).toEqual({ code: 4001, message: "User rejected personal_sign" });
  expect(boundary.calls[1]).toEqual(expect.objectContaining({
    method: "personal_sign",
    error: { code: 4001, message: "User rejected personal_sign" },
  }));
});

test("fast authentication creates isolated contexts for two roles", async ({ createAuthenticatedContext, cleanBaseline: _cleanBaseline }) => {
  const referrer = await createAuthenticatedContext("referrer");
  const referee = await createAuthenticatedContext("referee");

  expect(referrer.wallet.address).not.toBe(referee.wallet.address);
  expect(referrer.context).not.toBe(referee.context);

  await Promise.all([referrer.page.goto("/referrals"), referee.page.goto("/referrals")]);
  await expect(referrer.page).toHaveURL(/\/referrals$/);
  await expect(referee.page).toHaveURL(/\/referrals$/);
  await expect.poll(() => referrer.page.evaluate(() => localStorage.getItem("token"))).toBe(referrer.token);
  await expect.poll(() => referee.page.evaluate(() => localStorage.getItem("token"))).toBe(referee.token);
});
