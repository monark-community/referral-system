"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { CampaignLoading } from "@/components/campaigns/campaign-ui";

export default function CampaignLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/referrals/welcome");
  }, [isLoading, isAuthenticated, router]);
  return (
    <ResponsiveShell
      title="Campaigns"
      desktopSubtitle="Discover tasks, grow your community, and earn rewards."
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
    >
      <div className="w-full min-w-0">
        {!mounted || isLoading ? (
          <CampaignLoading />
        ) : isAuthenticated ? (
          children
        ) : null}
      </div>
    </ResponsiveShell>
  );
}
