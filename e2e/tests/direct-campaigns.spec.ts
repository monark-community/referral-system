import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

async function connectWallets(
  actors: Array<{ context: BrowserContext; wallet: { index: number } }>,
) {
  for (const actor of actors) {
    await actor.context.addInitScript(
      ({ index }: { index: number }) =>
        localStorage.setItem("reffinity:e2e-wallet-index", String(index)),
      { index: actor.wallet.index },
    );
  }
}

async function createDirectDraft(
  page: Page,
  title: string,
  runs: number,
  isPrivate = false,
) {
  await page.goto("/referrals/campaigns/new");
  await page.getByLabel("Campaign title").fill(title);
  await page.getByLabel("Category", { exact: true }).selectOption("COMMUNITY");
  await page
    .getByLabel("Task instructions")
    .fill("Complete the Direct campaign task and submit your username.");
  await page.getByLabel("End date and time").fill("2099-11-01T12:00");
  await page.getByRole("radio", { name: /Direct/ }).check();
  await page.getByLabel("Completion reward (native currency)").fill("0.003");
  await page.getByLabel("Referral pool (native currency)").fill("0.001");
  await page.getByLabel("Initially funded completions").fill(String(runs));
  if (isPrivate) await page.getByRole("radio", { name: "Private" }).check();
  await expect(page.getByText(`${(runs * 0.004).toString()} native currency`)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function submitDirectProof(
  page: Page,
  campaignUrl: string,
  proof: string,
) {
  await page.goto(campaignUrl);
  await page.getByLabel("Username or proof").fill(proof);
  await page.getByRole("button", { name: "Save proof & continue" }).click();
  await page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await expect(page.getByText("Under review", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

test("@direct-campaigns public Direct campaign accrues and withdraws a reward", async ({
  createAuthenticatedContext,
  cleanBaseline: _baseline,
}, testInfo) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  const participant = await createAuthenticatedContext("referee");
  await connectWallets([creator, participant]);

  const title = "Direct launch contribution";
  await createDirectDraft(creator.page, title, 2);
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const campaignUrl = creator.page.url();
  await expect(creator.page.getByText(/2 funded runs remaining/).first()).toBeVisible();
  await creator.page.screenshot({
    path: testInfo.outputPath("direct-campaign-owner-desktop.png"),
  });
  await creator.page.setViewportSize({ width: 390, height: 844 });
  await creator.page.locator("main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await creator.page.screenshot({
    path: testInfo.outputPath("direct-campaign-owner-mobile.png"),
  });
  await creator.page.setViewportSize({ width: 1280, height: 720 });

  await submitDirectProof(participant.page, campaignUrl, "direct-user#1234");
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Approve & credit Direct rewards" }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page
    .getByRole("button", { name: "Approve & credit Direct rewards" })
    .click();

  await participant.page.bringToFront();
  await expect(
    participant.page.getByText(/withdrawable Direct reward balance/),
  ).toBeVisible({ timeout: 20_000 });
  await participant.page.goto("/referrals/campaigns");
  const account = participant.page.getByRole("region", {
    name: "Direct reward balance",
  });
  await expect(account.getByText(/0\.003/).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(account.getByText("Direct reward credited")).toBeVisible();
  await account.getByRole("button", { name: "Withdraw full balance" }).click();
  await expect(account.getByText("Rewards withdrawn")).toBeVisible({
    timeout: 20_000,
  });
  await expect(account.getByText(/0 native currency/).first()).toBeVisible();
  await participant.page.setViewportSize({ width: 390, height: 844 });
  await account.screenshot({
    path: testInfo.outputPath("direct-reward-account-mobile.png"),
  });
  expect(
    await participant.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("@direct-campaigns a depleted campaign reopens after an owner top-up", async ({
  createAuthenticatedContext,
  cleanBaseline: _baseline,
}) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  const first = await createAuthenticatedContext("referee");
  const next = await createAuthenticatedContext("observer");
  await connectWallets([creator, first, next]);

  await createDirectDraft(creator.page, "One-run Direct task", 1);
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const campaignUrl = creator.page.url();
  await submitDirectProof(first.page, campaignUrl, "first-direct-user");
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Approve & credit Direct rewards" }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page
    .getByRole("button", { name: "Approve & credit Direct rewards" })
    .click();
  await expect(creator.page.getByText("Needs funding", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  await next.page.bringToFront();
  await next.page.goto(campaignUrl);
  await expect(next.page.getByText(/temporarily out of funded rewards/)).toBeVisible();
  await expect(next.page.getByLabel("Username or proof")).toHaveCount(0);

  await creator.page.bringToFront();
  await creator.page.getByLabel("Runs to add").fill("1");
  await creator.page.getByRole("button", { name: "Preview funding" }).click();
  await expect(creator.page.getByText(/0 → 1/)).toBeVisible();
  await creator.page
    .getByRole("button", { name: "Confirm funding in wallet" })
    .click();
  await expect(creator.page.getByText(/1 funded runs remaining/).first()).toBeVisible({
    timeout: 20_000,
  });

  await next.page.bringToFront();
  await next.page.reload();
  await expect(next.page.getByLabel("Username or proof")).toBeVisible({
    timeout: 20_000,
  });
});

test("@direct-campaigns private Direct link survives login and pays through the shared flow", async ({
  createAuthenticatedContext,
  createUserContext,
  cleanBaseline: _baseline,
}, testInfo) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  await createAuthenticatedContext("observer");
  const visitor = await createUserContext("observer");
  await connectWallets([creator]);

  const title = "Private Direct beta";
  await createDirectDraft(creator.page, title, 1, true);
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const link = await creator.page.getByLabel("Private campaign link").inputValue();

  await visitor.page.goto(link);
  await expect(visitor.page.getByRole("heading", { name: title })).toBeVisible();
  await expect(visitor.page.getByText("Direct reward")).toBeVisible();
  await visitor.page
    .getByRole("button", { name: "Log in or join to take part" })
    .click();
  await visitor.page.getByRole("button", { name: "Login", exact: true }).click();
  const connect = visitor.page.getByRole("button", { name: "Connect Test Wallet" });
  const signIn = visitor.page.getByRole("button", { name: "Sign & Login" });
  await expect(connect.or(signIn)).toBeVisible();
  if (await connect.isVisible()) await connect.click();
  await signIn.click();
  await expect(visitor.page).toHaveURL(link);
  await visitor.page.getByLabel("Username or proof").fill("private-direct-user");
  await visitor.page.getByRole("button", { name: "Save proof & continue" }).click();
  await visitor.page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await expect(visitor.page.getByText("Under review", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Approve & credit Direct rewards" }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page
    .getByRole("button", { name: "Approve & credit Direct rewards" })
    .click();
  await visitor.page.bringToFront();
  await expect(visitor.page.getByText(/withdrawable Direct reward balance/)).toBeVisible({
    timeout: 20_000,
  });
  await visitor.page.locator("main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await visitor.page.screenshot({
    path: testInfo.outputPath("private-direct-participant-desktop.png"),
  });
  await visitor.page.setViewportSize({ width: 390, height: 844 });
  await visitor.page.locator("main").evaluate((element) => {
    element.scrollTop = 0;
  });
  await visitor.page.screenshot({
    path: testInfo.outputPath("private-direct-participant-mobile.png"),
  });
});
