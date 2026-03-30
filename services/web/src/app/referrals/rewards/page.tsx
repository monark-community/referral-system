"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
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

function RewardTierCard({
  tier,
  unlocked,
  visible,
}: {
  tier: MilestoneTier;
  unlocked: boolean;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-5 space-y-3",
        unlocked ? "bg-card/50 opacity-100" : "bg-card/30 opacity-60"
      )}
      style={{
        boxShadow: unlocked
          ? "0 0 0 1px hsl(25 95% 53% / 0.25), 0 1px 3px hsl(0 0% 0% / 0.4), 0 1px 2px hsl(0 0% 0% / 0.3)"
          : "var(--shadow-card)",
        opacity: visible ? (unlocked ? 1 : 0.6) : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 400ms ease, transform 400ms ease, box-shadow 150ms ease",
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

const dummyTiers = [
  { name: "Bronze", points: 1000, icon: <Gift className="w-5 h-5" />, benefits: ["Early access to new features", "Bronze badge on profile"] },
  { name: "Silver", points: 5000, icon: <Star className="w-5 h-5" />, benefits: ["Priority support", "Silver badge on profile", "1 free month of LedgerLift"] },
  { name: "Gold", points: 15000, icon: <Trophy className="w-5 h-5" />, benefits: ["3 free months of LedgerLift", "Gold badge on profile", "Exclusive community access"] },
  { name: "Platinum", points: 50000, icon: <Zap className="w-5 h-5" />, benefits: ["Lifetime LedgerLift access", "Platinum badge on profile", "VIP Monark events", "Revenue sharing eligibility"] },
];

export default function RewardsPage() {
  const router = useRouter();
  const { data: tiersData, isLoading: tiersLoading } = useMilestoneTiers();
  const { data: userMilestone, isLoading: userLoading } = useUserMilestone();
  const [visibleCount, setVisibleCount] = useState(0);

  const tiers = tiersData?.tiers ?? [];
  const earnedPoints = userMilestone?.earnedPoints ?? 0;
  const loading = (tiersLoading && !tiersData) || (userLoading && !userMilestone);

  // +1 for the progress card at the top
  const itemCount = tiers.length > 0 ? tiers.length + 1 : dummyTiers.length + 1;

  useEffect(() => {
    if (loading) return;
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setVisibleCount(current);
      if (current >= itemCount) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, [loading, itemCount]);

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
          <>
            <div
              className="rounded-xl bg-card/50 p-5 surface-card"
              style={{
                opacity: visibleCount > 0 ? 1 : 0,
                transform: visibleCount > 0 ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 400ms ease, transform 400ms ease",
              }}
            >
              <p className="text-xs text-muted-foreground">Your Progress</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                {formatPoints(earnedPoints)} <span className="text-sm font-normal text-muted-foreground">points</span>
              </p>
            </div>

            <div className="space-y-0">
              {dummyTiers.map((tier, index) => {
                const unlocked = earnedPoints >= tier.points;
                const visible = index + 1 < visibleCount;
                return (
                  <div
                    key={tier.name}
                    className="flex gap-4"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateY(0)" : "translateY(16px)",
                      transition: "opacity 400ms ease, transform 400ms ease",
                    }}
                  >
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2 shrink-0 mt-5 transition-colors duration-300",
                        unlocked ? "bg-primary border-primary" : "bg-background border-muted-foreground/30"
                      )} />
                      {index < dummyTiers.length - 1 && (
                        <div className={cn(
                          "w-0.5 flex-1 min-h-[16px] transition-colors duration-300",
                          unlocked ? "bg-primary/40" : "bg-muted-foreground/15"
                        )} />
                      )}
                    </div>

                    {/* Card */}
                    <div className={cn(
                      "flex-1 rounded-xl p-4 mb-3 space-y-2",
                      unlocked ? "bg-card/50" : "bg-card/30"
                    )}
                      style={{
                        boxShadow: unlocked
                          ? "0 0 0 1px hsl(25 95% 53% / 0.25), 0 1px 3px hsl(0 0% 0% / 0.4)"
                          : "var(--shadow-card)",
                        opacity: unlocked ? 1 : 0.6,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("p-2 rounded-lg", unlocked ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                            {tier.icon}
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground text-sm">{tier.name}</h3>
                            <p className="text-xs text-muted-foreground tabular-nums">{formatPoints(tier.points)} points</p>
                          </div>
                        </div>
                        {unlocked && (
                          <span className="text-xs font-medium text-primary bg-primary/15 px-2.5 py-1 rounded-full">
                            Unlocked
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {tier.benefits.map((benefit, i) => (
                          <li key={i} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div
              className="rounded-xl bg-card/50 p-5 surface-card"
              style={{
                opacity: visibleCount > 0 ? 1 : 0,
                transform: visibleCount > 0 ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 400ms ease, transform 400ms ease",
              }}
            >
              <p className="text-xs text-muted-foreground">Your Progress</p>
              <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                {formatPoints(earnedPoints)} <span className="text-sm font-normal text-muted-foreground">points</span>
              </p>
            </div>

            <div className="space-y-4 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:space-y-0">
              {tiers.map((tier, index) => (
                <RewardTierCard
                  key={tier.level}
                  tier={tier}
                  unlocked={earnedPoints >= tier.pointsRequired}
                  visible={index + 1 < visibleCount}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </ResponsiveShell>
  );
}
