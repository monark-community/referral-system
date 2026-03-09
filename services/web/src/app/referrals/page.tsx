"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  PointsCard,
  ReferralLinkCard,
  NavMenuItem,
} from "@/components/referral";

import { useAuth } from "@/contexts/auth-context";

export default function ReferralsPage() {
  const router = useRouter();
  const { user: userData, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/referrals/welcome");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const referralLink = `${appUrl}/invite/${userData.referralCode}`;

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <PageHeader
        subtitle="LedgerLift"
        title="Referrals Program"
        onBack={() => router.push("/referrals/welcome")}
        onClose={() => router.push("/")}
      />

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Disabled Account Banner */}
          {userData.disabledAt && (
            <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 p-3">
              <p className="text-sm font-medium text-orange-400">
                Your account is disabled
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Re-enable your account in{" "}
                <button
                  onClick={() => router.push("/referrals/preferences")}
                  className="underline text-primary"
                >
                  Preferences
                </button>{" "}
                to resume earning rewards.
              </p>
            </div>
          )}

          {/* Points Section */}
          <section className="space-y-3">
            <div className="flex gap-3">
              <PointsCard
                label="Earned"
                points={userData.earnedPoints}
                variant="earned"
              />
              <PointsCard
                label="Pending"
                points={userData.pendingPoints}
                variant="pending"
              />
            </div>
          </section>

          {/* Referral Link Section */}
          <section>
            <ReferralLinkCard referralLink={referralLink} />
          </section>

          {/* Navigation Menu */}
          <section className="space-y-1 pt-2">
            <NavMenuItem
              label="Referral Program"
              onClick={() => router.push("/referrals")}
              isActive
            />
            <NavMenuItem
              label="My Profile"
              onClick={() => router.push("/referrals/profile")}
            />
            <NavMenuItem
              label="How it Works"
              onClick={() => router.push("/referrals/how-it-works")}
            />
            <NavMenuItem
              label="Invites History"
              onClick={() => router.push("/referrals/history")}
              badge={userData.pendingPoints > 0 ? 1 : 0}
            />
            <NavMenuItem
              label="Preferences"
              onClick={() => router.push("/referrals/preferences")}
            />
            <NavMenuItem
              label="Rewards"
              onClick={() => router.push("/referrals/rewards")}
            />
            <NavMenuItem
              label="Terms & Conditions"
              onClick={() => router.push("/referrals/terms")}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
