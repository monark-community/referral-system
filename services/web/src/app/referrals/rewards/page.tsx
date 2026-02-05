"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
import { Gift, Trophy, Star, Zap } from "lucide-react";
import { cn, formatPoints } from "@/lib/utils";

interface RewardTier {
  id: string;
  name: string;
  pointsRequired: number;
  icon: React.ReactNode;
  benefits: string[];
  unlocked: boolean;
}

const rewardTiers: RewardTier[] = [
  {
    id: "bronze",
    name: "Bronze",
    pointsRequired: 5000,
    icon: <Gift className="w-6 h-6" />,
    benefits: ["5% bonus on referral points", "Early access to new features"],
    unlocked: true,
  },
  {
    id: "silver",
    name: "Silver",
    pointsRequired: 15000,
    icon: <Star className="w-6 h-6" />,
    benefits: [
      "10% bonus on referral points",
      "Priority support",
      "Exclusive community access",
    ],
    unlocked: true,
  },
  {
    id: "gold",
    name: "Gold",
    pointsRequired: 50000,
    icon: <Trophy className="w-6 h-6" />,
    benefits: [
      "15% bonus on referral points",
      "Premium features unlocked",
      "Monthly rewards airdrop",
    ],
    unlocked: false,
  },
  {
    id: "platinum",
    name: "Platinum",
    pointsRequired: 100000,
    icon: <Zap className="w-6 h-6" />,
    benefits: [
      "20% bonus on referral points",
      "VIP ambassador status",
      "Direct team access",
      "Custom referral campaigns",
    ],
    unlocked: false,
  },
];

function RewardTierCard({ tier }: { tier: RewardTier }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-colors",
        tier.unlocked
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              tier.unlocked ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
            )}
          >
            {tier.icon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{tier.name}</h3>
            <p className="text-xs text-muted-foreground">
              {formatPoints(tier.pointsRequired)} points
            </p>
          </div>
        </div>
        {tier.unlocked && (
          <span className="text-xs font-medium text-primary bg-primary/20 px-2 py-1 rounded-full">
            Unlocked
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {tier.benefits.map((benefit, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            {benefit}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RewardsPage() {
  const router = useRouter();

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="Rewards"
        onBack={() => router.push("/referrals")}
        onClose={() => router.push("/referrals")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Earn points through referrals and unlock exclusive rewards. The more you
            refer, the higher your tier and benefits!
          </p>

          <div className="space-y-3">
            {rewardTiers.map((tier) => (
              <RewardTierCard key={tier.id} tier={tier} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
