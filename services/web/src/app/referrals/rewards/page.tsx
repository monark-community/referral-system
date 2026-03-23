"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/referral";
import { Gift, Trophy, Star, Zap, Loader2 } from "lucide-react";
import { cn, formatPoints } from "@/lib/utils";
import { getMilestoneTiers, getUserMilestone } from "@/lib/api/user";
import type { MilestoneTier } from "@/lib/api/user";

const tierIcons: Record<string, React.ReactNode> = {
  Bronze: <Gift className="w-6 h-6" />,
  Silver: <Star className="w-6 h-6" />,
  Gold: <Trophy className="w-6 h-6" />,
  Platinum: <Zap className="w-6 h-6" />,
};

function getIconForTier(name: string, level: number): React.ReactNode {
  if (tierIcons[name]) return tierIcons[name];
  // Fallback based on level
  const fallbacks = [
    <Gift key="gift" className="w-6 h-6" />,
    <Star key="star" className="w-6 h-6" />,
    <Trophy key="trophy" className="w-6 h-6" />,
    <Zap key="zap" className="w-6 h-6" />,
  ];
  return fallbacks[level % fallbacks.length];
}

function RewardTierCard({
  tier,
  unlocked,
}: {
  tier: MilestoneTier;
  unlocked: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-colors",
        unlocked
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              unlocked
                ? "bg-primary/20 text-primary"
                : "bg-secondary text-muted-foreground"
            )}
          >
            {getIconForTier(tier.name, tier.level)}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{tier.name}</h3>
            <p className="text-xs text-muted-foreground">
              {formatPoints(tier.pointsRequired)} points
            </p>
          </div>
        </div>
        {unlocked && (
          <span className="text-xs font-medium text-primary bg-primary/20 px-2 py-1 rounded-full">
            Unlocked
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {tier.benefits.map((benefit, index) => (
          <li
            key={index}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
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
  const [tiers, setTiers] = useState<MilestoneTier[]>([]);
  const [userMilestoneLevel, setUserMilestoneLevel] = useState(0);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tiersRes, userRes] = await Promise.all([
          getMilestoneTiers(),
          getUserMilestone(),
        ]);
        setTiers(tiersRes.tiers);
        setUserMilestoneLevel(userRes.milestoneLevel);
        setEarnedPoints(userRes.earnedPoints);
      } catch (error) {
        console.error("Failed to fetch milestone data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col max-w-md md:max-w-lg mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="Rewards"
        onBack={() => router.push("/referrals")}
        onClose={() => router.push("/referrals")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Earn points through referrals and unlock exclusive rewards. The more
            you refer, the higher your tier and benefits!
          </p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reward tiers available yet.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Your Progress</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatPoints(earnedPoints)} points
                </p>
              </div>

              <div className="space-y-3">
                {tiers.map((tier) => (
                  <RewardTierCard
                    key={tier.level}
                    tier={tier}
                    unlocked={earnedPoints >= tier.pointsRequired}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
