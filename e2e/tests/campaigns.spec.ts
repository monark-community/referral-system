import { createPublicClient, http, parseAbi } from "viem";
import { test, expect } from "../fixtures";

const contractAddress = process.env.E2E_REFERRAL_CONTRACT_ADDRESS as `0x${string}`;
const publicClient = createPublicClient({
  transport: http(process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545"),
});
const abi = parseAbi([
  "function getCampaign(bytes32 campaignId) view returns (bytes32 id,address owner,uint8 taskType,uint8 verificationType,uint8 status,uint8 rewardType,uint256 completerReward,uint256 referralPool,uint256 balance,uint8 visibility)",
]);

// What the contract records for the campaign on this page: 0 is public, 1 is private
async function chainVisibility(campaignUrl: string) {
  const id = campaignUrl.split("/").pop()!.replace(/-/g, "").padEnd(64, "0");
  const campaign = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: "getCampaign",
    args: [`0x${id}`],
  });
  return campaign[9];
}

test("@campaigns creator publishes a draft, reviews proof, and pays a participant", async ({
  createAuthenticatedContext,
  cleanBaseline: _baseline,
}, testInfo) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  const participant = await createAuthenticatedContext("referee");
  for (const actor of [creator, participant]) {
    await actor.context.addInitScript(
      ({ index }) => {
        localStorage.setItem("reffinity:e2e-wallet-index", String(index));
      },
      { index: actor.wallet.index },
    );
  }
  await creator.page.bringToFront();
  const title = "Join our launch community";
  await creator.page.goto("/referrals/campaigns");
  await creator.page
    .getByRole("link", { name: "Create campaign", exact: true })
    .click();
  await creator.page.getByLabel("Campaign title").fill(title);
  await creator.page
    .getByLabel("Category", { exact: true })
    .selectOption("COMMUNITY");
  await creator.page
    .getByLabel("Task instructions")
    .fill("Join our community and submit your username.");
  await creator.page.getByLabel("End date and time").fill("2099-11-01T12:00");
  await creator.page
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    creator.page.getByRole("heading", { name: title }),
  ).toBeVisible();
  const campaignUrl = creator.page.url();
  await participant.page.bringToFront();
  await participant.page.goto(campaignUrl);
  await expect(
    participant.page.getByText(/This campaign could not be found/),
  ).toBeVisible();
  await creator.page.bringToFront();
  await creator.page
    .getByRole("button", { name: "Edit draft", exact: true })
    .click();
  await creator.page.getByLabel("Completion reward (points)").fill("35");
  await creator.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  expect(await chainVisibility(campaignUrl)).toBe(0);
  await expect(
    creator.page.getByRole("button", { name: "Save proof & continue" }),
  ).toHaveCount(0);
  await creator.page.screenshot({
    path: testInfo.outputPath("campaign-creator.png"),
    fullPage: true,
  });

  await participant.page.bringToFront();
  await participant.page.goto(campaignUrl);
  await participant.page
    .getByLabel("Username or proof")
    .fill("launch-participant#1234");
  await participant.page
    .getByRole("button", { name: "Save proof & continue" })
    .click();
  await participant.page.evaluate(() =>
    localStorage.setItem(
      "reffinity:e2e-wallet-reject-method",
      "eth_sendTransaction",
    ),
  );
  await participant.page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await expect(
    participant.page.getByText(
      "The wallet request was declined. Your progress is saved; you can try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await participant.page.evaluate(() =>
    localStorage.removeItem("reffinity:e2e-wallet-reject-method"),
  );
  await participant.page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await expect(
    participant.page.getByText("Under review", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Approve & pay 35 points" }),
  ).toBeVisible({ timeout: 15_000 });
  await creator.page
    .getByRole("button", { name: "Approve & pay 35 points" })
    .click();
  await participant.page.bringToFront();
  await expect(
    participant.page.getByText(
      "You earned 35 points. Your reward is confirmed.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("article").getByText("Rewarded", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const response = await participant.context.request.get(
        `${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/api/auth/me`,
        { headers: { authorization: `Bearer ${participant.token}` } },
      );
      return (await response.json()).user.earnedPoints;
    })
    .toBe(35);
  await creator.page.screenshot({
    path: testInfo.outputPath("campaign-review-rewarded.png"),
    fullPage: true,
  });
  await participant.page.setViewportSize({ width: 390, height: 844 });
  await participant.page.screenshot({
    path: testInfo.outputPath("campaign-participant-mobile.png"),
    fullPage: true,
  });
  expect(
    await participant.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();

  await creator.page.bringToFront();
  await creator.page
    .getByRole("button", { name: "Pause campaign", exact: true })
    .click();
  await expect(creator.page.getByText("Paused", { exact: true })).toBeVisible();
  await creator.page
    .getByRole("button", { name: "Resume campaign", exact: true })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible();
});

test("@campaigns creator rejects proof with feedback and the participant cannot resubmit", async ({
  createAuthenticatedContext,
  cleanBaseline: _baseline,
}) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  const participant = await createAuthenticatedContext("referee");
  for (const actor of [creator, participant]) {
    await actor.context.addInitScript(
      ({ index }) =>
        localStorage.setItem("reffinity:e2e-wallet-index", String(index)),
      { index: actor.wallet.index },
    );
  }
  await creator.page.bringToFront();
  await creator.page.goto("/referrals/campaigns/new");
  await creator.page.getByLabel("Campaign title").fill("Share our launch post");
  await creator.page
    .getByLabel("Task instructions")
    .fill("Share the launch post and submit the link.");
  await creator.page.getByLabel("End date and time").fill("2099-11-01T12:00");
  await creator.page
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await participant.page.bringToFront();
  await participant.page.goto(creator.page.url());
  await participant.page
    .getByLabel("Proof link")
    .fill("https://example.com/someone-else");
  await participant.page
    .getByRole("button", { name: "Save proof & continue" })
    .click();
  await participant.page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Reject submission" }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page.getByRole("button", { name: "Reject submission" }).click();
  await expect(
    creator.page.getByRole("button", { name: "Reject & confirm in wallet" }),
  ).toBeDisabled();
  await creator.page
    .getByLabel("Reason for rejection")
    .fill("Please use your own profile.");
  await creator.page
    .getByRole("button", { name: "Reject & confirm in wallet" })
    .click();
  await participant.page.bringToFront();
  await expect(
    participant.page.getByText(
      "This submission is final. Each person can submit to a campaign once.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    participant.page.getByText(
      /Creator’s feedback: Please use your own profile/,
    ),
  ).toBeVisible();
  await expect(
    participant.page.getByRole("button", { name: "Save proof & continue" }),
  ).toHaveCount(0);
});

test("@campaigns a private campaign opens only through its link, and logging in from the link comes back to it", async ({
  createAuthenticatedContext,
  createUserContext,
  cleanBaseline: _baseline,
}) => {
  test.slow();
  const creator = await createAuthenticatedContext("primary");
  const participant = await createAuthenticatedContext("referee");
  // The visitor already has an account, but opens the link logged out
  await createAuthenticatedContext("observer");
  const visitor = await createUserContext("observer");
  for (const actor of [creator, participant]) {
    await actor.context.addInitScript(
      ({ index }) =>
        localStorage.setItem("reffinity:e2e-wallet-index", String(index)),
      { index: actor.wallet.index },
    );
  }
  const title = "Private beta feedback";
  const instructions = "Try the beta and submit your community username.";
  await creator.page.bringToFront();
  await creator.page.goto("/referrals/campaigns/new");
  await creator.page.getByLabel("Campaign title").fill(title);
  await creator.page
    .getByLabel("Category", { exact: true })
    .selectOption("COMMUNITY");
  await creator.page.getByLabel("Task instructions").fill(instructions);
  await creator.page.getByLabel("End date and time").fill("2099-11-01T12:00");
  await creator.page.getByRole("radio", { name: "Private" }).check();
  await creator.page
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(
    creator.page.getByRole("heading", { name: title }),
  ).toBeVisible();
  await expect(
    creator.page.getByRole("button", { name: "Cancel campaign" }),
  ).toBeVisible();
  await creator.page
    .getByRole("button", { name: "Publish campaign in wallet" })
    .click();
  await expect(creator.page.getByText("Active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Once published, a campaign is ended rather than cancelled
  await expect(
    creator.page.getByRole("button", { name: "End campaign" }),
  ).toBeVisible();
  await expect(
    creator.page.getByRole("button", { name: "Cancel campaign" }),
  ).toHaveCount(0);
  const link = await creator.page
    .getByLabel("Private campaign link")
    .inputValue();
  expect(link).toMatch(/\/campaigns\/private\/[\w-]{24}$/);
  const campaignUrl = creator.page.url();
  expect(await chainVisibility(campaignUrl)).toBe(1);

  // Not on the board, and its id alone doesn't open it
  await participant.page.bringToFront();
  await participant.page.goto("/referrals/campaigns");
  await expect(
    participant.page.getByText("More opportunities are on the way"),
  ).toBeVisible();
  await participant.page.goto(campaignUrl);
  await expect(
    participant.page.getByText(/This campaign could not be found/),
  ).toBeVisible();

  // Logged out, the link shows the campaign, and logging in comes back to it
  await visitor.page.bringToFront();
  await visitor.page.goto(link);
  await expect(
    visitor.page.getByRole("heading", { name: title }),
  ).toBeVisible();
  await expect(visitor.page.getByText(instructions)).toBeVisible();
  await visitor.page
    .getByRole("button", { name: "Log in or join to take part" })
    .click();
  await visitor.page
    .getByRole("button", { name: "Login", exact: true })
    .click();
  const connect = visitor.page.getByRole("button", {
    name: "Connect Test Wallet",
  });
  const signIn = visitor.page.getByRole("button", { name: "Sign & Login" });
  await expect(connect.or(signIn)).toBeVisible();
  if (await connect.isVisible()) await connect.click();
  await signIn.click();
  await expect(visitor.page).toHaveURL(link);
  await expect(visitor.page.getByLabel("Username or proof")).toBeVisible();

  // Signed in, the link takes the proof, and the creator reviews it as usual
  await participant.page.bringToFront();
  await participant.page.goto(link);
  await participant.page
    .getByLabel("Username or proof")
    .fill("beta-tester#4321");
  await participant.page
    .getByRole("button", { name: "Save proof & continue" })
    .click();
  await participant.page
    .getByRole("button", { name: "Confirm submission in wallet" })
    .click();
  await expect(
    participant.page.getByText("Under review", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await creator.page.bringToFront();
  await expect(
    creator.page.getByRole("button", { name: "Approve & pay 30 points" }),
  ).toBeVisible({ timeout: 20_000 });

  // The participant finds it again under their submissions
  await participant.page.bringToFront();
  await participant.page.goto("/referrals/campaigns");
  await participant.page.getByRole("tab", { name: /My submissions/ }).click();
  await participant.page
    .getByRole("link", { name: new RegExp(title) })
    .click();
  await expect(
    participant.page.getByRole("heading", { name: title }),
  ).toBeVisible();
  await expect(
    participant.page.getByText("Under review", { exact: true }),
  ).toBeVisible();

  // Paying out works the same as for a public campaign
  await creator.page.bringToFront();
  await creator.page
    .getByRole("button", { name: "Approve & pay 30 points" })
    .click();
  await participant.page.bringToFront();
  await expect(
    participant.page.getByText(
      "You earned 30 points. Your reward is confirmed.",
    ),
  ).toBeVisible({ timeout: 20_000 });
});
