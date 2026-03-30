"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, TrendingUp, Clock, ArrowRight, Copy, Check, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import { PointsCard } from "@/components/referral/points-card";
import { ReferralLinkCard } from "@/components/referral/referral-link-card";
import { NavMenuItem } from "@/components/referral/nav-menu-item";

const PointsChart = dynamic(
  () => import("@/components/referral/points-chart").then((m) => m.PointsChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] animate-pulse rounded-lg bg-secondary/30" />
    ),
  }
);
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useInvites } from "@/lib/api/hooks";
import { formatPoints } from "@/lib/utils";
import type { Invite } from "@/lib/api/user";

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl bg-card/50 p-4 space-y-1.5 surface-card">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground/40" />
      </div>
      <p className="text-2xl font-semibold text-foreground tracking-tight tabular-nums">
        {value}
      </p>
      {subtitle && (
        <p className="text-[12px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function QuickShareCard({ referralLink }: { referralLink: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="rounded-xl bg-card/50 p-5 surface-card flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-foreground">
            Invite Friends
          </h3>
          <Share2 className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed" style={{ textWrap: "pretty" }}>
          Share your referral link with friends and earn points together when they join.
        </p>
      </div>

      <div className="space-y-3">
        <div className="px-3 py-2.5 bg-secondary/60 rounded-[10px] overflow-hidden" style={{ boxShadow: "inset 0 1px 2px hsl(0 0% 0% / 0.2)" }}>
          <p className="text-[13px] text-muted-foreground truncate font-mono">
            {referralLink}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="w-full px-4 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-[13px] font-medium active:scale-[0.96] transition-[transform,filter] duration-150 hover:brightness-110 flex items-center justify-center gap-1.5"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy Referral Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function RecentActivityCard({
  invites,
  onViewAll,
}: {
  invites: Invite[];
  onViewAll: () => void;
}) {
  if (invites.length === 0) {
    return (
      <div className="rounded-xl bg-card/50 p-5 surface-card">
        <h3 className="text-[15px] font-semibold text-foreground mb-3">
          Recent Activity
        </h3>
        <div className="py-6 text-center">
          <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">
            No referrals yet. Share your link to get started!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/50 p-5 surface-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-foreground">
          Recent Activity
        </h3>
        <button
          onClick={onViewAll}
          className="text-[13px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 active:scale-[0.96] transition-[color,transform] duration-150 py-1 px-2 -mr-2 rounded-md"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="divide-y divide-border/30">
        {invites.slice(0, 5).map((invite) => (
          <div
            key={invite.id}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-muted-foreground">
                {(invite.referee?.name || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">
                {invite.referee?.name || "Unknown User"}
              </p>
            </div>
            <p className="text-[12px] text-muted-foreground shrink-0">
              {invite.createdAt}
            </p>
            <div className="tabular-nums shrink-0 min-w-[80px] text-right">
              {invite.status === 1 ? (
                <span className="text-[12px] font-medium text-green-400">
                  +{invite.points?.toLocaleString() || 0} pts
                </span>
              ) : invite.status === 0 ? (
                <span className="text-[12px] font-medium text-orange-400">
                  Pending
                </span>
              ) : (
                <span className="text-[12px] font-medium text-muted-foreground">
                  Cancelled
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReferralsPage() {
  const router = useRouter();
  const { user: userData, isAuthenticated, isLoading } = useAuth();
  const { data: invitesData } = useInvites();
  const queryClient = useQueryClient();

  // Prefetch data for likely navigation targets
  useEffect(() => {
    if (isAuthenticated) {
      queryClient.prefetchQuery({ queryKey: ["profile"], queryFn: () => import("@/lib/api/user").then(m => m.getProfile()) });
      queryClient.prefetchQuery({ queryKey: ["user-milestone"], queryFn: () => import("@/lib/api/user").then(m => m.getUserMilestone()) });
      queryClient.prefetchQuery({ queryKey: ["milestone-tiers"], queryFn: () => import("@/lib/api/user").then(m => m.getMilestoneTiers()) });
    }
  }, [isAuthenticated, queryClient]);
  const invites = invitesData?.invites || [];

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/referrals/welcome");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const referralLink = `${appUrl}/invite/${userData.referralCode}`;
  const totalReferrals = invites.length;
  const earnedReferrals = invites.filter((i) => i.status === 1).length;

  return (
    <ResponsiveShell
      title="Referrals Program"
      subtitle="LedgerLift"
      onBack={() => router.push("/referrals/welcome")}
      onClose={() => router.push("/")}
      desktopTitle="Dashboard"
      desktopSubtitle="Track your referral performance and rewards"
    >
      <div className="space-y-6">
        {userData.disabledAt && (
          <div className="rounded-xl p-4 surface-card" style={{ boxShadow: "0 0 0 1px hsl(25 95% 53% / 0.3), 0 1px 3px hsl(0 0% 0% / 0.4)" }}>
            <p className="text-sm font-medium text-orange-400">
              Your account is disabled
            </p>
            <p className="text-xs text-muted-foreground mt-1" style={{ textWrap: "pretty" }}>
              Re-enable your account in{" "}
              <button
                onClick={() => router.push("/referrals/preferences")}
                className="underline text-primary hover:text-primary/80 transition-colors duration-150"
              >
                Preferences
              </button>{" "}
              to resume earning rewards.
            </p>
          </div>
        )}

        {/* Desktop Layout */}
        <div className="hidden lg:block space-y-5">
          {/* Top row: chart + share */}
          <div className="grid grid-cols-[1fr_380px] gap-5 items-stretch">
            <div className="rounded-xl bg-card/50 p-6 surface-card">
              <PointsChart
                earnedPoints={userData.earnedPoints}
                pendingPoints={userData.pendingPoints}
                createdAt={userData.createdAt}
              />
            </div>
            <QuickShareCard referralLink={referralLink} />
          </div>

          {/* Stat cards row */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Earned Points"
              value={formatPoints(userData.earnedPoints)}
              icon={TrendingUp}
              subtitle="Confirmed rewards"
            />
            <StatCard
              label="Pending Points"
              value={formatPoints(userData.pendingPoints)}
              icon={Clock}
              subtitle="Awaiting confirmation"
            />
            <StatCard
              label="Total Referrals"
              value={totalReferrals}
              icon={Users}
              subtitle={`${earnedReferrals} confirmed`}
            />
          </div>

          {/* Activity — full width */}
          <RecentActivityCard
            invites={invites}
            onViewAll={() => router.push("/referrals/history")}
          />
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden space-y-6">
          <section className="space-y-3">
            <div className="flex gap-3">
              <PointsCard label="Earned" points={userData.earnedPoints} variant="earned" />
              <PointsCard label="Pending" points={userData.pendingPoints} variant="pending" />
            </div>
          </section>

          <section>
            <ReferralLinkCard referralLink={referralLink} />
          </section>

          <section className="space-y-1 pt-2">
            <NavMenuItem label="Referral Program" onClick={() => router.push("/referrals")} isActive />
            <NavMenuItem label="My Profile" onClick={() => router.push("/referrals/profile")} />
            <NavMenuItem label="How it Works" onClick={() => router.push("/referrals/how-it-works")} />
            <NavMenuItem label="Invites History" onClick={() => router.push("/referrals/history")} badge={userData.pendingPoints > 0 ? 1 : 0} />
            <NavMenuItem label="Preferences" onClick={() => router.push("/referrals/preferences")} />
            <NavMenuItem label="Rewards" onClick={() => router.push("/referrals/rewards")} />
            <NavMenuItem label="Terms & Conditions" onClick={() => router.push("/referrals/terms")} />
          </section>
        </div>
      </div>
    </ResponsiveShell>
  );
}
