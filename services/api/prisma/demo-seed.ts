// Purpose: Builds a demo-ready local Reffinity: verified users in a referral tree who joined through the real
// contract, and campaigns with real submissions and payouts. Every point total comes from the chain.
// Usage: npm run demo:seed (from the repository root) once the local Docker stack is up. See docs/DEMO_DATA.md.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { id as hashUtf8 } from "ethers";
import { RefferalABI } from "@reffinity/common-contracts";
import { configuredReferralAddress } from "@reffinity/blockchain-connector/contracts";
import { uuidToBytes32 } from "@reffinity/blockchain-connector/uuidBytesConverter";

type DemoUser = {
  key: string;
  hardhatAccount: number;
  walletAddress: string;
  name: string;
  email: string;
  referralCode: string;
  referredBy?: string;
};

type DemoCompletion = { user: string; status: "REWARDED" | "UNDER_REVIEW"; proof?: string };

type DemoCampaign = {
  key: string;
  owner: string;
  title: string;
  description: string;
  instructions: string;
  category: "SOCIAL_MEDIA" | "COMMUNITY";
  verificationType: "MANUAL" | "PRE_VERIFIED";
  completerPoints: number;
  referralPoolPoints: number;
  maxCompletions?: number;
  endsInDays: number;
  isPrivate: boolean;
  publish: boolean;
  winners?: { user: string; label?: string }[];
  completions?: DemoCompletion[];
};

type DemoConfig = { users: DemoUser[]; campaigns: DemoCampaign[] };

// A demo user once saved, with the wallet that signs for them
type Person = DemoUser & { id: string; account: HDAccount; referrer?: Person; referralId?: string };

type SeededCampaign = { spec: DemoCampaign; id: string; taskId: string; privateCode: string | null; owner: Person };

// A transaction as the API describes it for the caller's wallet to send
type ChainCall = { functionName: string; args: (string | number)[]; valueWei?: string };

const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
// Account #0 deployed the contract and is the API's own signer, so demo users start at #1
const FIRST_DEMO_ACCOUNT = 1;
const LAST_FUNDED_ACCOUNT = 19;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const INVITE_ACCEPTED = 1;
const CHAIN_FULFILLMENT_VERIFIED = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const LISTENER_TIMEOUT_MS = Number(process.env.DEMO_SEED_TIMEOUT_MS ?? 120_000);
const RESET_HINT =
  "Reset the local stack and run the seed again: docker compose --profile local-chain down -v, then up -d --build --wait.";

const prisma = new PrismaClient();
const apiUrl = (process.env.DEMO_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const webUrl = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const contractAddress = configuredReferralAddress();
const publicClient = createPublicClient({ chain: hardhat, transport: http(rpcUrl) });
// The API names its calls by function name, so sending them goes through the untyped ABI
const callableAbi: Abi = RefferalABI;

function fail(message: string): never {
  throw new Error(message);
}

function requireLocalDatabase(): void {
  if (process.env.DEMO_SEED_ALLOW_REMOTE === "true") return;
  const url = process.env.DATABASE_URL ?? "";
  const local = /(?:localhost|127\.0\.0\.1|@postgres:)/i.test(url);
  if (!local) {
    fail("Refusing to seed a non-local database. Use a local DATABASE_URL, or set DEMO_SEED_ALLOW_REMOTE=true deliberately.");
  }
}

// The demo wallets come from the public Hardhat mnemonic, so only the local chain is allowed
async function requireLocalStack(): Promise<void> {
  let chainId: number;
  try {
    chainId = await publicClient.getChainId();
  } catch {
    fail(`Could not reach the chain at ${rpcUrl}. Start the stack first: docker compose --profile local-chain up -d --build --wait`);
  }
  if (chainId !== hardhat.id) {
    fail(`The chain at ${rpcUrl} has id ${chainId}; the demo seed only runs on the local Hardhat chain (${hardhat.id}).`);
  }
  const code = await publicClient.getCode({ address: contractAddress });
  if (!code || code === "0x") fail(`No contract at ${contractAddress}; the hardhat-deploy container may not have finished.`);

  const ready = await fetch(`${apiUrl}/ready`).catch(() => null);
  if (!ready) fail(`Could not reach the API at ${apiUrl}. It must be running, since it records what happens on chain.`);
  if (!ready.ok) fail(`The API at ${apiUrl} is not ready yet (${ready.status}). Wait a moment and run the seed again.`);
}

async function loadConfig(): Promise<DemoConfig> {
  const path = fileURLToPath(new URL("./demo-data.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as DemoConfig;
}

function requireUnique(values: (string | number)[], what: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) fail(`Demo ${what} must be unique; ${value} appears twice`);
    seen.add(value);
  }
}

// A referrer must be on chain before the people they referred, so this puts every referrer first
function joinOrder(users: DemoUser[]): DemoUser[] {
  const byKey = new Map(users.map((user) => [user.key, user]));
  const depth = new Map<string, number>();
  const depthOf = (user: DemoUser, path: Set<string>): number => {
    const known = depth.get(user.key);
    if (known !== undefined) return known;
    if (path.has(user.key)) fail(`The demo referral tree loops back to ${user.key}`);
    path.add(user.key);
    const value = user.referredBy ? depthOf(byKey.get(user.referredBy)!, path) + 1 : 0;
    depth.set(user.key, value);
    return value;
  };
  for (const user of users) depthOf(user, new Set());
  return [...users].sort((a, b) => depth.get(a.key)! - depth.get(b.key)!);
}

function assertConfig(config: DemoConfig): void {
  const users = new Map(config.users.map((user) => [user.key, user]));
  requireUnique(config.users.map((user) => user.key), "user keys");
  requireUnique(config.users.map((user) => user.hardhatAccount), "Hardhat accounts");
  requireUnique(config.users.map((user) => user.referralCode), "referral codes");
  requireUnique(config.users.map((user) => user.email.toLowerCase()), "emails");
  for (const user of config.users) {
    const index = user.hardhatAccount;
    if (!Number.isInteger(index) || index < FIRST_DEMO_ACCOUNT || index > LAST_FUNDED_ACCOUNT) {
      fail(`${user.key} must use one of the funded Hardhat accounts #${FIRST_DEMO_ACCOUNT}-#${LAST_FUNDED_ACCOUNT}`);
    }
    const derived = mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: index }).address;
    if (derived.toLowerCase() !== user.walletAddress.toLowerCase()) {
      fail(`${user.key}: Hardhat account #${index} is ${derived}, not ${user.walletAddress}`);
    }
    // Same shape as the codes the API generates. Invite links split on "-", so a code can't contain one
    if (!/^[A-Z0-9]{10}$/.test(user.referralCode)) fail(`${user.key}: a referral code is 10 capital letters or digits`);
    if (user.referredBy && !users.has(user.referredBy)) fail(`Unknown referrer ${user.referredBy}`);
  }
  joinOrder(config.users);

  requireUnique(config.campaigns.map((campaign) => campaign.key), "campaign keys");
  // The seed finds its campaigns again by owner and title
  requireUnique(config.campaigns.map((campaign) => `${campaign.owner}: ${campaign.title}`), "campaign titles per owner");
  for (const campaign of config.campaigns) {
    if (!users.has(campaign.owner)) fail(`Unknown campaign owner ${campaign.owner}`);
    if (campaign.verificationType === "PRE_VERIFIED") {
      if (!campaign.isPrivate || !campaign.winners?.length) fail(`Pre-verified campaign ${campaign.key} must be private and list winners`);
      // Reserving and claiming winners has no screens yet, so the seed stops at the draft
      if (campaign.publish || campaign.completions?.length) fail(`Pre-verified campaign ${campaign.key} stays an unpublished draft`);
    }
    for (const winner of campaign.winners ?? []) {
      if (!users.has(winner.user)) fail(`${campaign.key}: unknown winner ${winner.user}`);
      if (winner.user === campaign.owner) fail(`${campaign.key}: creators can't win their own campaigns`);
    }
    const participants = (campaign.completions ?? []).map((completion) => completion.user);
    requireUnique(participants, `submitters on ${campaign.key}`);
    for (const completion of campaign.completions ?? []) {
      if (!campaign.publish) fail(`${campaign.key}: only a published campaign can have submissions`);
      if (!users.has(completion.user)) fail(`${campaign.key}: unknown submitter ${completion.user}`);
      if (completion.user === campaign.owner) fail(`${campaign.key}: creators can't complete their own campaigns`);
      if (completion.status !== "REWARDED" && completion.status !== "UNDER_REVIEW") {
        fail(`${campaign.key}: a submission ends as REWARDED or UNDER_REVIEW`);
      }
    }
    if (campaign.maxCompletions !== undefined && participants.length > campaign.maxCompletions) {
      fail(`${campaign.key} has more submissions than spots`);
    }
  }
}

// ---------- Chain and API helpers ----------

async function publicLinkOf(wallet: Address): Promise<Hex> {
  return publicClient.readContract({ address: contractAddress, abi: RefferalABI, functionName: "userPublicLinkIds", args: [wallet] });
}

async function campaignIsOnChain(campaignId: string): Promise<boolean> {
  try {
    await publicClient.readContract({
      address: contractAddress,
      abi: RefferalABI,
      functionName: "getCampaign",
      args: [uuidToBytes32(campaignId)],
    });
    return true;
  } catch {
    return false; // CampaignNotFound
  }
}

// The participant's submission status on chain (1 submitted, 2 verified, 3 rejected), or null without one
async function chainSubmissionStatus(campaignId: string, wallet: Address): Promise<number | null> {
  try {
    const fulfillment = await publicClient.readContract({
      address: contractAddress,
      abi: RefferalABI,
      functionName: "getParticipantCampaignFulfillment",
      args: [uuidToBytes32(campaignId), wallet],
    });
    return Number(fulfillment.status);
  } catch {
    return null; // FulfillmentNotFound
  }
}

async function send(person: Person, call: ChainCall): Promise<void> {
  const wallet = createWalletClient({ account: person.account, chain: hardhat, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({
    address: contractAddress,
    abi: callableAbi,
    functionName: call.functionName,
    // The API sends amounts as JSON numbers; the contract takes them as uints
    args: call.args.map((arg) => (typeof arg === "number" ? BigInt(arg) : arg)),
    ...(call.valueWei ? { value: BigInt(call.valueWei) } : {}),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`${call.functionName} from ${person.name} failed on chain (${hash})`);
}

async function api<T>(method: "GET" | "POST", path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${apiUrl}/api${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} /api${path} answered ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

const tokens = new Map<string, string>();

// Logs in the way the website does: the wallet signs a message and the API returns a session token
async function tokenFor(person: Person): Promise<string> {
  const cached = tokens.get(person.key);
  if (cached) return cached;
  const message = `Sign this message to authenticate with Reffinity.\n\nTimestamp: ${Date.now()}\nWallet: ${person.account.address}`;
  const signature = await person.account.signMessage({ message });
  const result = await api<{ token: string; isNewUser: boolean }>("POST", "/auth/wallet", {
    body: { walletAddress: person.account.address, signature, message },
  });
  if (result.isNewUser) fail(`The API made a new account for ${person.name}, so the seeded one was missing`);
  tokens.set(person.key, result.token);
  return result.token;
}

// The API learns about transactions from its blockchain listener, which polls the chain every few seconds.
// `stillPending` lists what the database doesn't show yet.
async function waitForApi(what: string, stillPending: () => Promise<string[]>): Promise<void> {
  let pending = await stillPending();
  if (pending.length === 0) return;
  console.log(`  Waiting for the API to record ${what}...`);
  const deadline = Date.now() + LISTENER_TIMEOUT_MS;
  while (pending.length > 0) {
    if (Date.now() > deadline) {
      fail(
        `Timed out waiting for the API to record ${what}: ${pending.join(", ")}. ` +
          "Check docker compose logs api, then run the seed again; finished steps are skipped.",
      );
    }
    await sleep(1_000);
    pending = await stillPending();
  }
}

// ---------- Users ----------

// Saves each user as if they had signed up and verified their email, without sending any email
async function seedUsers(config: DemoConfig): Promise<Person[]> {
  const people = new Map<string, Person>();
  for (const user of joinOrder(config.users)) {
    const wallet = user.walletAddress.toLowerCase();
    const email = user.email.toLowerCase();
    const referrer = user.referredBy ? people.get(user.referredBy)! : undefined;

    const existing = await prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (existing && existing.email !== email) {
      fail(`Hardhat account #${user.hardhatAccount} (${wallet}) already belongs to another account (${existing.name ?? "an unfinished sign-up"}). ${RESET_HINT}`);
    }
    for (const clash of [
      await prisma.user.findFirst({ where: { email, walletAddress: { not: wallet } } }),
      await prisma.user.findFirst({ where: { referralCode: user.referralCode, walletAddress: { not: wallet } } }),
    ]) {
      if (clash) fail(`Another account (${clash.walletAddress}) already uses ${user.name}'s email or referral code. ${RESET_HINT}`);
    }
    if (existing && existing.referralCode !== user.referralCode && (await publicLinkOf(wallet as Address)) !== ZERO_BYTES32) {
      fail(`${user.name} already joined on chain with referral code ${existing.referralCode}. ${RESET_HINT}`);
    }
    const referral = existing ? await prisma.referral.findFirst({ where: { refereeId: existing.id }, orderBy: { createdAt: "asc" } }) : null;
    if (referral && referral.referrerId !== referrer?.id) fail(`${user.name} is already recorded with another referrer. ${RESET_HINT}`);

    const profile = {
      name: user.name,
      email,
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
      referralCode: user.referralCode,
      referredBy: referrer?.id ?? null,
      disabledAt: null,
    };
    const saved = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { ...profile, termsAcceptedAt: existing.termsAcceptedAt ?? new Date() } })
      : await prisma.user.create({ data: { ...profile, walletAddress: wallet, termsAcceptedAt: new Date() } });

    // The same row the API makes when someone signs up through a referral link. Its id is the referral id on chain
    const referralId = referrer
      ? (referral ?? (await prisma.referral.create({ data: { referrerId: referrer.id, refereeId: saved.id, status: 0, points: 0 } }))).id
      : undefined;

    people.set(user.key, {
      ...user,
      id: saved.id,
      account: mnemonicToAccount(HARDHAT_MNEMONIC, { addressIndex: user.hardhatAccount }),
      referrer,
      referralId,
    });
  }
  console.log(`Saved ${people.size} verified users.`);
  return [...people.values()];
}

// Each user joins the program on chain the way the website's sign-up does: through their referrer's
// public link, or on their own. The contract then pays the sign-up points
async function joinOnChain(people: Person[]): Promise<void> {
  // Checks everyone before sending anything, so a mismatch stops the seed without touching the chain
  const toJoin: Person[] = [];
  for (const person of people) {
    const wallet = person.account.address;
    const registeredLink = await publicLinkOf(wallet);

    if (registeredLink !== ZERO_BYTES32) {
      const referrer = await publicClient.readContract({ address: contractAddress, abi: RefferalABI, functionName: "viewReferrer", args: [wallet] });
      const expectedReferrer = person.referrer?.account.address ?? ZERO_ADDRESS;
      if (registeredLink.toLowerCase() !== hashUtf8(person.referralCode).toLowerCase() || referrer.toLowerCase() !== expectedReferrer.toLowerCase()) {
        fail(`${person.name} joined on chain with another referral code or referrer. ${RESET_HINT}`);
      }
      continue;
    }

    // Not on chain, but the database says they joined: the chain was restarted without wiping the database
    const user = await prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    const referral = person.referralId ? await prisma.referral.findUnique({ where: { id: person.referralId } }) : null;
    if (user.earnedPoints > 0 || referral?.status === INVITE_ACCEPTED) {
      fail(`The database shows ${person.name} as joined, but the chain doesn't. ${RESET_HINT}`);
    }
    toJoin.push(person);
  }

  for (const person of toJoin) {
    const linkId = hashUtf8(person.referralCode) as Hex;
    await send(
      person,
      person.referrer
        ? {
            functionName: "acceptPublicReferral",
            args: [hashUtf8(person.referrer.referralCode), uuidToBytes32(person.referralId!), linkId],
          }
        : { functionName: "joinProgram", args: [linkId] },
    );
  }
  console.log(`Joined the program on chain: ${toJoin.length} now, ${people.length - toJoin.length} earlier.`);

  await waitForApi("the sign-ups", async () => {
    const pending: string[] = [];
    for (const person of people.filter((candidate) => candidate.referralId)) {
      const referral = await prisma.referral.findUnique({ where: { id: person.referralId! } });
      if (referral?.status !== INVITE_ACCEPTED) pending.push(person.name);
    }
    return pending;
  });
}

// ---------- Campaigns ----------

async function findCampaign(owner: Person, title: string) {
  return prisma.campaign.findFirst({
    where: { ownerId: owner.id, title, isSystem: false, status: { not: "CANCELLED" } },
    include: { task: true },
    orderBy: { createdAt: "asc" },
  });
}

function draftBody(spec: DemoCampaign, people: Map<string, Person>) {
  return {
    title: spec.title,
    description: spec.description,
    instructions: spec.instructions,
    category: spec.category,
    rewardType: "POINTS",
    verificationType: spec.verificationType,
    completerPoints: spec.completerPoints,
    referralPoolPoints: spec.referralPoolPoints,
    isPrivate: spec.isPrivate,
    endsAt: new Date(Date.now() + spec.endsInDays * DAY_MS).toISOString(),
    // A pre-verified campaign gets one spot per listed wallet instead of a number
    ...(spec.verificationType === "PRE_VERIFIED"
      ? {
          winners: spec.winners!.map((winner) => ({
            walletAddress: people.get(winner.user)!.walletAddress.toLowerCase(),
            ...(winner.label ? { label: winner.label } : {}),
          })),
        }
      : { maxCompletions: spec.maxCompletions }),
  };
}

// Creates each campaign through the API like the website's form, then publishes it from the owner's wallet
async function seedCampaigns(config: DemoConfig, people: Map<string, Person>): Promise<SeededCampaign[]> {
  const seeded: SeededCampaign[] = [];
  let created = 0;
  let published = 0;
  for (const spec of config.campaigns) {
    const owner = people.get(spec.owner)!;
    let row = await findCampaign(owner, spec.title);
    if (!row) {
      await api("POST", "/campaigns", { token: await tokenFor(owner), body: draftBody(spec, people) });
      created += 1;
      row = (await findCampaign(owner, spec.title)) ?? fail(`The API saved no campaign called "${spec.title}"`);
    }

    if (row.publishedAt || row.status !== "DRAFT") {
      if (!(await campaignIsOnChain(row.id))) fail(`The database shows "${spec.title}" as published, but the chain has no such campaign. ${RESET_HINT}`);
    } else if (spec.publish && !(await campaignIsOnChain(row.id))) {
      const mine = await api<{ created: { id: string; chain: ChainCall | null }[] }>("GET", "/campaigns/mine", {
        token: await tokenFor(owner),
      });
      const call = mine.created.find((campaign) => campaign.id === row.id)?.chain;
      await send(owner, call ?? fail(`The API gave no publish transaction for "${spec.title}"`));
      published += 1;
    }
    seeded.push({ spec, id: row.id, taskId: row.task?.id ?? fail(`"${spec.title}" has no task`), privateCode: row.privateCode, owner });
  }
  console.log(`Campaigns: ${created} created, ${published} published now, ${config.campaigns.length - created} existed already.`);

  await waitForApi("the published campaigns", async () => {
    const pending: string[] = [];
    for (const campaign of seeded.filter((candidate) => candidate.spec.publish)) {
      const row = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
      if (!row.publishedAt) pending.push(campaign.spec.title);
    }
    return pending;
  });
  return seeded;
}

function proofFor(spec: DemoCampaign, person: Person): string {
  return spec.category === "SOCIAL_MEDIA"
    ? `https://example.com/demo-posts/${person.key}/${spec.key}`
    : `@${person.key}_demo`;
}

function submissionsOf(campaigns: SeededCampaign[], people: Map<string, Person>, status?: DemoCompletion["status"]) {
  return campaigns.flatMap((campaign) =>
    (campaign.spec.completions ?? [])
      .filter((completion) => !status || completion.status === status)
      .map((completion) => ({ campaign, completion, person: people.get(completion.user)! })),
  );
}

async function submissionRow(campaign: SeededCampaign, person: Person) {
  return prisma.campaignFulfillment.findFirst({ where: { taskId: campaign.taskId, participantId: person.id } });
}

// Each listed person submits proof through the API and sends the submission from their own wallet
async function seedSubmissions(campaigns: SeededCampaign[], people: Map<string, Person>): Promise<void> {
  const work = submissionsOf(campaigns, people);
  let submitted = 0;
  for (const { campaign, completion, person } of work) {
    const existing = await submissionRow(campaign, person);
    if (existing && existing.status !== "SUBMITTED") continue;
    if ((await chainSubmissionStatus(campaign.id, person.account.address)) !== null) continue;

    let call: ChainCall | null;
    if (existing) {
      // Saved by the API earlier, but the transaction never went out
      call = { functionName: "submitCampaignFulfillment", args: [uuidToBytes32(campaign.id), uuidToBytes32(existing.id)] };
    } else {
      const result = await api<{ fulfillment: { chain: ChainCall | null } }>("POST", `/campaigns/${campaign.id}/fulfillments`, {
        token: await tokenFor(person),
        body: {
          proof: completion.proof ?? proofFor(campaign.spec, person),
          ...(campaign.privateCode ? { code: campaign.privateCode } : {}),
        },
      });
      call = result.fulfillment.chain;
    }
    await send(person, call ?? fail(`The API gave no submit transaction for ${person.name} on "${campaign.spec.title}"`));
    submitted += 1;
  }
  console.log(`Submissions: ${submitted} sent now, ${work.length - submitted} earlier.`);

  await waitForApi("the submissions", async () => {
    const pending: string[] = [];
    for (const { campaign, person } of work) {
      const row = await submissionRow(campaign, person);
      if (!row || row.status === "SUBMITTED") pending.push(`${person.name} on "${campaign.spec.title}"`);
    }
    return pending;
  });
}

// The owner approves the submissions meant to be paid; the rest stay waiting for review
async function seedApprovals(campaigns: SeededCampaign[], people: Map<string, Person>): Promise<void> {
  const work = submissionsOf(campaigns, people, "REWARDED");
  let approved = 0;
  for (const { campaign, person } of work) {
    const row = (await submissionRow(campaign, person))!;
    if (row.status === "REWARDED") continue;
    if (row.status === "REJECTED") fail(`${person.name}'s submission on "${campaign.spec.title}" was rejected. ${RESET_HINT}`);
    if ((await chainSubmissionStatus(campaign.id, person.account.address)) === CHAIN_FULFILLMENT_VERIFIED) continue;

    let call: ChainCall | null;
    if (row.status === "APPROVED") {
      // Approved through the API earlier, but the transaction never went out
      call = { functionName: "verifyCampaignFulfillment", args: [uuidToBytes32(row.id)] };
    } else {
      const result = await api<{ fulfillment: { chain: ChainCall | null } }>(
        "POST",
        `/campaigns/${campaign.id}/fulfillments/${row.id}/approve`,
        { token: await tokenFor(campaign.owner) },
      );
      call = result.fulfillment.chain;
    }
    await send(campaign.owner, call ?? fail(`The API gave no approval transaction for ${person.name} on "${campaign.spec.title}"`));
    approved += 1;
  }
  console.log(`Approvals: ${approved} sent now, ${work.length - approved} earlier.`);

  await waitForApi("the payouts", async () => {
    const pending: string[] = [];
    for (const { campaign, person } of work) {
      if ((await submissionRow(campaign, person))?.status !== "REWARDED") pending.push(`${person.name} on "${campaign.spec.title}"`);
    }
    return pending;
  });
}

// The dashboards read points from the database, which the listener copies from the chain
async function waitForPoints(people: Person[]): Promise<void> {
  await waitForApi("everyone's points", async () => {
    const pending: string[] = [];
    for (const person of people) {
      const [earned, pendingPoints, user] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: RefferalABI, functionName: "viewPoints", args: [person.account.address] }),
        publicClient.readContract({ address: contractAddress, abi: RefferalABI, functionName: "viewPendingPoints", args: [person.account.address] }),
        prisma.user.findUniqueOrThrow({ where: { id: person.id } }),
      ]);
      if (user.earnedPoints !== Number(earned) || user.pendingPoints !== Number(pendingPoints)) {
        pending.push(`${person.name} (${user.earnedPoints} of ${earned})`);
      }
    }
    return pending;
  });
}

async function printSummary(people: Person[], campaigns: SeededCampaign[]): Promise<void> {
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: people.map((person) => person.id) } } })).map((user) => [user.id, user]),
  );
  console.log("\nDemo users (log in by importing the Hardhat mnemonic into MetaMask and picking the account):");
  console.table(
    people.map((person) => ({
      name: person.name,
      account: `#${person.hardhatAccount}`,
      "referral code": person.referralCode,
      "referred by": person.referrer?.name ?? "",
      points: users.get(person.id)!.earnedPoints,
      level: users.get(person.id)!.milestoneLevel,
    })),
  );

  const rows = [];
  for (const campaign of campaigns) {
    const row = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const counts = await prisma.campaignFulfillment.groupBy({ by: ["status"], where: { taskId: campaign.taskId }, _count: true });
    const count = (status: string) => counts.find((entry) => entry.status === status)?._count ?? 0;
    rows.push({
      campaign: campaign.spec.title,
      owner: campaign.owner.name,
      status: row.status,
      visibility: row.isPrivate ? "private" : "public",
      paid: count("REWARDED"),
      "to review": count("UNDER_REVIEW"),
    });
  }
  console.log("Demo campaigns:");
  console.table(rows);

  const used = new Set(people.map((person) => person.hardhatAccount));
  const free = [];
  for (let index = FIRST_DEMO_ACCOUNT; index <= LAST_FUNDED_ACCOUNT; index += 1) if (!used.has(index)) free.push(`#${index}`);
  console.log(`Unused Hardhat accounts for live sign-ups: ${free.join(", ") || "none"}`);
  const referrer = people.find((person) => people.some((other) => other.referrer === person));
  if (referrer) console.log(`Example referral link (${referrer.name}): ${webUrl}/invite/${referrer.referralCode}`);
}

async function main(): Promise<void> {
  requireLocalDatabase();
  const config = await loadConfig();
  assertConfig(config);
  await requireLocalStack();

  const people = await seedUsers(config);
  const byKey = new Map(people.map((person) => [person.key, person]));
  await joinOnChain(people);
  const campaigns = await seedCampaigns(config, byKey);
  await seedSubmissions(campaigns, byKey);
  await seedApprovals(campaigns, byKey);
  await waitForPoints(people);
  await printSummary(people, campaigns);
  console.log("\nDemo data ready.");
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
