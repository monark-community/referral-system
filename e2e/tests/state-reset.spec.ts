import { test, expect } from "../fixtures";
import { createWalletClient, http, parseAbi } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const immutabilityAbi = parseAbi([
  "function acceptInvite(address referrer, bytes32 inviteId)",
]);

async function joinThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/referrals/welcome");
  await page.getByRole("button", { name: "Join the Program" }).click();
  const connectButton = page.getByRole("button", { name: "Connect Test Wallet" });
  if (await connectButton.isVisible()) await connectButton.click();
  await page.getByRole("button", { name: "Sign & Continue" }).click();
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
}

test("restores the database, contract, mailbox, and listener to a clean baseline", async ({
  page,
  resetState,
  cleanBaseline: _cleanBaseline,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("reffinity:e2e-wallet-index", "0");
  });
  await joinThroughUi(page);

  const firstTransaction = await page.evaluate(() =>
    (window as any).__REFFINITY_E2E_WALLET__?.calls.find(
      (call: { method: string }) => call.method === "eth_sendTransaction",
    )?.result,
  );
  expect(firstTransaction).toMatch(/^0x[0-9a-f]{64}$/i);

  const account = mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex: 0 },
  );
  const client = createWalletClient({
    account,
    transport: http(process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545"),
  });
  await expect(client.writeContract({
    address: process.env.E2E_REFERRAL_CONTRACT_ADDRESS as `0x${string}`,
    abi: immutabilityAbi,
    functionName: "acceptInvite",
    args: [account.address, `0x${"01".padEnd(64, "0")}`],
  })).rejects.toThrow();

  const reset = await resetState();
  expect(reset.counts).toEqual(expect.objectContaining({
    users: 0,
    referrals: 0,
    referralPointAllocations: 0,
    chainSyncStates: 1,
    milestoneTiers: 0,
  }));

  await page.evaluate(() => localStorage.clear());
  await joinThroughUi(page);
  const secondTransaction = await page.evaluate(() => {
    const calls = (window as any).__REFFINITY_E2E_WALLET__?.calls ?? [];
    return calls.filter((call: { method: string }) => call.method === "eth_sendTransaction").at(-1)?.result;
  });
  expect(secondTransaction).toMatch(/^0x[0-9a-f]{64}$/i);
});
