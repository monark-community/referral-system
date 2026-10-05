import { test as base, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { mnemonicToAccount } from "viem/accounts";

const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const roleOffset = { primary: 0, referrer: 1, referee: 2, observer: 3 } as const;
export type WalletRole = keyof typeof roleOffset;

export type AllocatedWallet = {
  index: number;
  address: `0x${string}`;
  signMessage(message: string): Promise<`0x${string}`>;
};

type AuthenticatedContext = {
  context: BrowserContext;
  page: Page;
  token: string;
  user: Record<string, unknown>;
  wallet: AllocatedWallet;
};

type E2EFixtures = {
  walletFor(role?: WalletRole): AllocatedWallet;
  beginFullOnboarding(page: Page, role?: WalletRole): Promise<AllocatedWallet>;
  createAuthenticatedContext(role?: WalletRole): Promise<AuthenticatedContext>;
  createUserContext(role?: WalletRole): Promise<{ context: BrowserContext; page: Page; wallet: AllocatedWallet }>;
  resetState(): Promise<Record<string, unknown>>;
  cleanBaseline: Record<string, unknown>;
};

async function attachServiceLogs(testInfo: TestInfo) {
  const artifactRoot = process.env.E2E_ARTIFACTS_ROOT ?? path.resolve("playwright-output", "local");
  const logDirectory = path.join(artifactRoot, "service-logs");

  try {
    await access(logDirectory);
    for (const filename of await readdir(logDirectory)) {
      if (!filename.endsWith(".log")) continue;
      await testInfo.attach(filename, {
        path: path.join(logDirectory, filename),
        contentType: "text/plain",
      });
    }
  } catch {
    // The runner may fail before Docker has emitted any service logs.
  }
}

export const test = base.extend<E2EFixtures & { failureDiagnostics: void }>({
  resetState: async ({ request }, use) => {
    await use(async () => {
      const response = await request.post(
        `${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/__e2e/reset`,
        { headers: { "x-e2e-reset-key": process.env.E2E_RESET_KEY ?? "" } },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      const result = await response.json();
      expect(result).toEqual(expect.objectContaining({
        generation: expect.any(Number),
        blockNumber: expect.stringMatching(/^0x[0-9a-f]+$/i),
        contractAddress: expect.stringMatching(/^0x[0-9a-f]{40}$/i),
        counts: expect.objectContaining({
          users: 0,
          referrals: 0,
          referralPointAllocations: 0,
          chainSyncStates: 1,
          milestoneTiers: 0,
        }),
      }));
      await expect.poll(async () => {
        const ready = await request.get(
          `${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/ready`,
        );
        return ready.status();
      }).toBe(200);
      return result;
    });
  },
  cleanBaseline: async ({ resetState }, use) => {
    await use(await resetState());
  },
  walletFor: async ({}, use, workerInfo) => {
    await use((role: WalletRole = "primary") => {
      // parallelIndex is stable when Playwright restarts a failed worker; workerIndex is not.
      const index = workerInfo.parallelIndex * 4 + roleOffset[role];
      if (index > 19) throw new Error(`No deterministic Hardhat wallet for parallel worker ${workerInfo.parallelIndex}, role ${role}`);
      const account = mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: index });
      return {
        index,
        address: account.address,
        signMessage: (message: string) => account.signMessage({ message }),
      };
    });
  },
  createUserContext: async ({ browser, walletFor }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role: WalletRole = "primary") => {
      const wallet = walletFor(role);
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(({ index }) => {
        localStorage.setItem("reffinity:e2e-wallet-index", String(index));
      }, { index: wallet.index });
      return { context, page: await context.newPage(), wallet };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  beginFullOnboarding: async ({ walletFor }, use) => {
    await use(async (page: Page, role: WalletRole = "primary") => {
      const wallet = walletFor(role);
      await page.addInitScript(({ index }) => {
        localStorage.setItem("reffinity:e2e-wallet-index", String(index));
      }, { index: wallet.index });
      await page.goto("/referrals/welcome");
      await page.getByRole("button", { name: "Join the Program" }).click();
      return wallet;
    });
  },
  createAuthenticatedContext: async ({ browser, request, walletFor }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role: WalletRole = "primary") => {
      const wallet = walletFor(role);
      const message = `Reffinity E2E authentication\nWallet: ${wallet.address}\nRole: ${role}`;
      const signature = await wallet.signMessage(message);
      const response = await request.post(`${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/api/auth/wallet`, {
        data: { walletAddress: wallet.address, signature, message },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const payload = await response.json();
      const webOrigin = new URL(process.env.E2E_WEB_BASE_URL ?? "http://web:3000").origin;
      const context = await browser.newContext({
        storageState: {
          cookies: [],
          origins: [{ origin: webOrigin, localStorage: [{ name: "token", value: payload.token }] }],
        },
      });
      contexts.push(context);
      const page = await context.newPage();
      return { context, page, token: payload.token, user: payload.user, wallet };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  failureDiagnostics: [
    async ({ page, request }, use, testInfo) => {
      const browserMessages: string[] = [];
      page.on("console", (message) => browserMessages.push(`[${message.type()}] ${message.text()}`));
      page.on("pageerror", (error) => browserMessages.push(`[pageerror] ${error.stack ?? error.message}`));

      await use();

      if (testInfo.status === testInfo.expectedStatus) return;

      await attachServiceLogs(testInfo);
      await testInfo.attach("browser-console.log", {
        body: Buffer.from(browserMessages.join("\n") || "No browser console output was captured."),
        contentType: "text/plain",
      });

      const probes = await Promise.all(
        [
          ["web", process.env.E2E_WEB_BASE_URL ?? "http://web:3000"],
          ["api", `${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/ready`],
          ["hardhat", process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545"],
        ].map(async ([name, url]) => {
          try {
            const response = await request.get(url);
            return { name, url, status: response.status(), body: (await response.text()).slice(0, 4_000) };
          } catch (error) {
            return { name, url, error: error instanceof Error ? error.message : String(error) };
          }
        }),
      );
      await testInfo.attach("service-probes.json", {
        body: Buffer.from(JSON.stringify(probes, null, 2)),
        contentType: "application/json",
      });
    },
    { auto: true },
  ],
});

export { expect };
