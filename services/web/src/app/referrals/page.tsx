"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  PointsCard,
  ReferralLinkCard,
  NavMenuItem,
} from "@/components/referral";

import { getProfile } from '@/lib/api/user';
import type { User } from "@/lib/api/auth";

// Mock data - replace with actual API calls
const apiResponse = await getProfile();
const userApiData: User = apiResponse.user;

export default function ReferralsPage() {
  const router = useRouter();
  const [userData] = useState(userApiData);

  const referralLink = `https://monark.io/invite/${userData.referralCode}`;

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
