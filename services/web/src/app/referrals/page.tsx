"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  PointsCard,
  ReferralLinkCard,
  NavMenuItem,
} from "@/components/referral";

import { getProfile } from '@/lib/api/user';
import type { User } from "@/lib/api/auth";

export default function ReferralsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then((res) => setUserData(res.user))
      .catch((err) => {
        console.error("Failed to load profile:", err);
        router.push("/referrals/welcome");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
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
