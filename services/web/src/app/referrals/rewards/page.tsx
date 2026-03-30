"use client";

import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout";
import { Gift, Trophy, Star, Zap, Loader2 } from "lucide-react";
import { cn, formatPoints } from "@/lib/utils";
import { useMilestoneTiers, useUserMilestone } from "@/lib/api/hooks";
import type { MilestoneTier } from "@/lib/api/user";

const tierIcons: Record<string, React.ReactNode> = {
  Bronze: <Gift className="w-6 h-6" />,
  Silver: <Star className="w-6 h-6" />,
  Gold: <Trophy className="w-6 h-6" />,
  Platinum: <Zap className="w-6 h-6" />,
};

function getIconForTier(name: string, level: number): React.ReactNode {
  if (tierIcons[name]) return tierIcons[name];
  const fallbacks = [
    <Gift key="gift" className="w-6 h-6" />,
    <Star key="star" className="w-6 h-6" />,
    <Trophy key="trophy" className="w-6 h-6" />,
    <Zap key="zap" className="w-6 h-6" />,
  ];
  return fallbacks[level % fallbacks.length];
}

function RewardTierCard({ tier, unlocked }: { tier: MilestoneTier; unlocked: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl p-5 space-y-3 transition-[box-shadow,opacity] duration-150",
        unlocked ? "bg-card/50 opacity-100" : "bg-card/30 opacity-60"
      )}
      style={{
        boxShadow: unlocked
          ? "0 0 0 1px hsl(25 95% 53% / 0.25), 0 1px 3px hsl(0 0% 0% / 0.4), 0 1px 2px hsl(0 0% 0% / 0.3)"
          : "var(--shadow-card)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", unlocked ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
            {getIconForTier(tier.name, tier.level)}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{tier.name}</h3>
            <p className="text-xs text-muted-foreground tabular-nums">{formatPoints(tier.pointsRequired)} points</p>
          </div>
        </div>
        {unlocked && (
          <span className="text-xs font-medium text-primary bg-primary/15 px-2.5 py-1 rounded-full">
            Unlocked
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {tier.benefits.map((benefit, index) => (
          <li key={index} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
            <span style={{ textWrap: "pretty" }}>{benefit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RewardsPage() {
  const router = useRouter();
  const { data: tiersData, isLoading: tiersLoading } = useMilestoneTiers();
  const { data: userMilestone, isLoading: userLoading } = useUserMilestone();

  const tiers = tiersData?.tiers ?? [];
  const earnedPoints = userMilestone?.earnedPoints ?? 0;
  const loading = (tiersLoading && !tiersData) || (userLoading && !userMilestone);

  return (
    <ResponsiveShell
      title="Rewards"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
      desktopTitle="Rewards"
      desktopSubtitle="Earn points through referrals and unlock exclusive benefits"
    >
      <div className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No reward tiers available yet.
          </p>
        ) : (
          <>
            <div className="rounded-xl bg-card/50 p-5 surface-card">
              <p className="text-xs text-muted-foreground">Your Progress</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                {formatPoints(earnedPoints)} <span className="text-sm font-normal text-muted-foreground">points</span>
              </p>
            </div>

            <div className="space-y-4 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:space-y-0">
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
    </ResponsiveShell>
  );
}
