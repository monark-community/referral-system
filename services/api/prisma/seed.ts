import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed milestone tiers (must match the on-chain milestones from deploy.js)
  const tiers = [
    {
      level: 0,
      name: "Starter",
      pointsRequired: 0,
      benefits: ["Access to referral program", "Basic referral link"],
    },
    {
      level: 1,
      name: "Bronze",
      pointsRequired: 500,
      benefits: ["5% bonus on referral points", "Early access to new features"],
    },
    {
      level: 2,
      name: "Silver",
      pointsRequired: 1500,
      benefits: [
        "10% bonus on referral points",
        "Priority support",
        "Exclusive community access",
      ],
    },
    {
      level: 3,
      name: "Gold",
      pointsRequired: 5000,
      benefits: [
        "15% bonus on referral points",
        "Premium features unlocked",
        "Monthly rewards airdrop",
      ],
    },
    {
      level: 4,
      name: "Platinum",
      pointsRequired: 10000,
      benefits: [
        "20% bonus on referral points",
        "VIP ambassador status",
        "Direct team access",
        "Custom referral campaigns",
      ],
    },
  ];

  for (const tier of tiers) {
    await prisma.milestoneTier.upsert({
      where: { level: tier.level },
      update: tier,
      create: tier,
    });
  }

  console.log(`Seeded ${tiers.length} milestone tiers`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
