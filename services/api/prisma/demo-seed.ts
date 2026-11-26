// Purpose: Adds deterministic, local-only demo users, referral history, and runnable campaign drafts.
// Usage: npm run demo:seed (from the repository root).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

type DemoUser = {
  key: string;
  name: string;
  email: string;
  walletAddress: string;
  referralCode: string;
  earnedPoints: number;
  pendingPoints: number;
  milestoneLevel: number;
  referredBy?: string;
};

type DemoCampaign = {
  key: string;
  owner: string;
  title: string;
  description: string;
  instructions: string;
  category: "SOCIAL_MEDIA" | "COMMUNITY";
  verificationType: "MANUAL" | "PRE_VERIFIED";
  rewardType: "POINTS";
  completerPoints: number;
  referralPoolPoints: number;
  maxCompletions?: number;
  endsInDays: number;
  isPrivate: boolean;
  winners?: { user: string; label?: string }[];
};

type DemoConfig = { users: DemoUser[]; campaigns: DemoCampaign[] };

const prisma = new PrismaClient();
const DEMO_NAMESPACE = "71d76e6b";

// Stable UUIDs make the initializer safe to run repeatedly without duplicating records.
function stableUuid(kind: number, index: number): string {
  return `${DEMO_NAMESPACE}-${kind.toString(16).padStart(4, "0")}-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function requireLocalDatabase(): void {
  if (process.env.DEMO_SEED_ALLOW_REMOTE === "true") return;
  const url = process.env.DATABASE_URL ?? "";
  const local = /(?:localhost|127\.0\.0\.1|@postgres:)/i.test(url);
  if (!local) {
    throw new Error(
      "Refusing to seed a non-local database. Use a local DATABASE_URL, or set DEMO_SEED_ALLOW_REMOTE=true deliberately.",
    );
  }
}

function assertConfig(config: DemoConfig): void {
  const userKeys = new Set(config.users.map((user) => user.key));
  if (userKeys.size !== config.users.length) throw new Error("Demo user keys must be unique");
  for (const user of config.users) {
    if (!/^0x[0-9a-f]{40}$/i.test(user.walletAddress)) throw new Error(`Invalid wallet for ${user.key}`);
    if (user.referredBy && !userKeys.has(user.referredBy)) throw new Error(`Unknown referrer ${user.referredBy}`);
  }
  for (const campaign of config.campaigns) {
    if (!userKeys.has(campaign.owner)) throw new Error(`Unknown campaign owner ${campaign.owner}`);
    if (campaign.verificationType === "PRE_VERIFIED" && (!campaign.isPrivate || !campaign.winners?.length)) {
      throw new Error(`Pre-verified campaign ${campaign.key} must be private and list winners`);
    }
  }
}

async function loadConfig(): Promise<DemoConfig> {
  const path = fileURLToPath(new URL("./demo-data.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as DemoConfig;
}

async function seedUsers(config: DemoConfig): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [index, user] of config.users.entries()) {
    const id = stableUuid(1, index + 1);
    ids.set(user.key, id);
    await prisma.user.upsert({
      where: { id },
      create: {
        id,
        walletAddress: user.walletAddress.toLowerCase(),
        name: user.name,
        email: user.email.toLowerCase(),
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
        referralCode: user.referralCode,
        termsAcceptedAt: new Date("2026-01-15T12:00:00.000Z"),
        earnedPoints: user.earnedPoints,
        pendingPoints: user.pendingPoints,
        milestoneLevel: user.milestoneLevel,
      },
      update: {
        walletAddress: user.walletAddress.toLowerCase(),
        name: user.name,
        email: user.email.toLowerCase(),
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
        referralCode: user.referralCode,
        termsAcceptedAt: new Date("2026-01-15T12:00:00.000Z"),
        earnedPoints: user.earnedPoints,
        pendingPoints: user.pendingPoints,
        milestoneLevel: user.milestoneLevel,
        disabledAt: null,
      },
    });
  }

  // Relationships are applied after all users exist, so config order does not matter.
  for (const user of config.users) {
    await prisma.user.update({
      where: { id: ids.get(user.key)! },
      data: { referredBy: user.referredBy ? ids.get(user.referredBy)! : null },
    });
  }
  return ids;
}

async function seedReferralHistory(config: DemoConfig, userIds: Map<string, string>): Promise<number> {
  let count = 0;
  for (const [index, user] of config.users.filter((candidate) => candidate.referredBy).entries()) {
    const id = stableUuid(2, index + 1);
    const referrer = config.users.find((candidate) => candidate.key === user.referredBy)!;
    await prisma.referral.upsert({
      where: { id },
      create: {
        id,
        referrerId: userIds.get(user.referredBy!)!,
        refereeId: userIds.get(user.key)!,
        status: 1,
        points: 100,
        description: `${referrer.name} referred ${user.name}`,
        isVerified: true,
      },
      update: {
        referrerId: userIds.get(user.referredBy!)!,
        refereeId: userIds.get(user.key)!,
        status: 1,
        points: 100,
        description: `${referrer.name} referred ${user.name}`,
        isVerified: true,
      },
    });
    count += 1;
  }
  return count;
}

async function seedCampaigns(config: DemoConfig, userIds: Map<string, string>): Promise<void> {
  for (const [index, campaign] of config.campaigns.entries()) {
    const id = stableUuid(3, index + 1);
    const taskId = stableUuid(4, index + 1);
    const verificationId = stableUuid(5, index + 1);
    const rewardId = stableUuid(6, index + 1);
    const endsAt = new Date(Date.now() + campaign.endsInDays * 24 * 60 * 60 * 1000);
    const privateCode = campaign.isPrivate ? `demo-${campaign.key}` : null;

    await prisma.campaign.upsert({
      where: { id },
      create: {
        id,
        key: campaign.key,
        title: campaign.title,
        description: campaign.description,
        instructions: campaign.instructions,
        status: "DRAFT",
        ownerId: userIds.get(campaign.owner)!,
        maxCompletions: campaign.winners?.length ?? campaign.maxCompletions!,
        endsAt,
        isPrivate: campaign.isPrivate,
        privateCode,
      },
      update: {
        title: campaign.title,
        description: campaign.description,
        instructions: campaign.instructions,
        status: "DRAFT",
        ownerId: userIds.get(campaign.owner)!,
        maxCompletions: campaign.winners?.length ?? campaign.maxCompletions!,
        endsAt,
        publishedAt: null,
        publishTransactionHash: null,
        chainStatus: null,
        chainBalanceWei: null,
        isPrivate: campaign.isPrivate,
        privateCode,
      },
    });

    await prisma.campaignTask.upsert({
      where: { id: taskId },
      create: { id: taskId, campaignId: id, type: "BOUNTY", strategyKey: "BOUNTY_V1", configuration: { category: campaign.category } },
      update: { type: "BOUNTY", strategyKey: "BOUNTY_V1", configuration: { category: campaign.category } },
    });
    await prisma.campaignVerificationPolicy.upsert({
      where: { id: verificationId },
      create: {
        id: verificationId,
        taskId,
        type: campaign.verificationType,
        strategyKey: campaign.verificationType === "PRE_VERIFIED" ? "CREATOR_WINNER_LIST_V1" : "OWNER_APPROVAL_V1",
        configuration: {},
      },
      update: {
        type: campaign.verificationType,
        strategyKey: campaign.verificationType === "PRE_VERIFIED" ? "CREATOR_WINNER_LIST_V1" : "OWNER_APPROVAL_V1",
        configuration: {},
      },
    });
    await prisma.campaignRewardPolicy.upsert({
      where: { id: rewardId },
      create: {
        id: rewardId,
        taskId,
        type: "POINTS",
        strategyKey: "CAMPAIGN_POINTS_V1",
        configuration: { completerPoints: campaign.completerPoints, referralPoolPoints: campaign.referralPoolPoints },
      },
      update: {
        type: "POINTS",
        strategyKey: "CAMPAIGN_POINTS_V1",
        configuration: { completerPoints: campaign.completerPoints, referralPoolPoints: campaign.referralPoolPoints },
      },
    });

    for (const [winnerIndex, winner] of (campaign.winners ?? []).entries()) {
      const winnerId = stableUuid(7 + index, winnerIndex + 1);
      const winnerUser = config.users.find((user) => user.key === winner.user)!;
      await prisma.campaignWinner.upsert({
        where: { id: winnerId },
        create: {
          id: winnerId,
          campaignId: id,
          walletAddress: winnerUser.walletAddress.toLowerCase(),
          label: winner.label,
          status: "LISTED",
          chainId: 31337,
        },
        update: {
          campaignId: id,
          walletAddress: winnerUser.walletAddress.toLowerCase(),
          label: winner.label,
          status: "LISTED",
          chainId: 31337,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  requireLocalDatabase();
  const config = await loadConfig();
  assertConfig(config);
  const userIds = await seedUsers(config);
  const referrals = await seedReferralHistory(config, userIds);
  await seedCampaigns(config, userIds);
  console.log(`Demo data ready: ${config.users.length} verified users, ${referrals} referrals, ${config.campaigns.length} campaign drafts.`);
  console.log("Demo owner: CampaignOwnerSteve / Hardhat account #1 / referral code STEVEDEMO1");
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
