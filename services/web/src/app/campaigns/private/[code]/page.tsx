// Purpose: The page a private campaign's link opens - anyone can read the campaign, and a signed-in user can take part
// Notes:
// - Lives outside /referrals/campaigns, whose layout sends logged-out visitors to the welcome page
// - Logging in or joining from here comes back to this page (see lib/return-to.ts)
// - The code from the link goes with the proof; without it the API treats the campaign as unknown

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api/client";
import { getPrivateCampaign, type Campaign } from "@/lib/api/campaigns";
import { clearReturnTo, rememberReturnTo } from "@/lib/return-to";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Button } from "@/components/ui/button";
import { ParticipantSubmission } from "@/components/campaigns/campaign-actions";
import {
  acceptsSubmissions,
  campaignPanel,
  CampaignHeading,
  CampaignLoading,
  CampaignNotice,
  CampaignOverview,
  closedReason,
  privateCampaignPath,
} from "@/components/campaigns/campaign-ui";

export default function PrivateCampaignPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Signed in on this page, so a pending "come back to this link" is done
  useEffect(() => {
    if (isAuthenticated) clearReturnTo();
  }, [isAuthenticated]);
  const query = useQuery({
    queryKey: ["campaigns", "private", code],
    queryFn: () => getPrivateCampaign(code),
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
    refetchInterval: 5000,
  });
  const logIn = () => {
    rememberReturnTo(privateCampaignPath(code));
    router.push("/referrals/welcome");
  };

  if (!mounted || isLoading)
    return (
      <div className="min-h-screen bg-background p-4 lg:p-8">
        <CampaignLoading />
      </div>
    );

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const campaign = query.data?.campaign;
  const body = query.isPending ? (
    <CampaignLoading />
  ) : notFound ? (
    <CampaignNotice error>
      This link doesn’t open a campaign. Check that you have the whole link, or
      ask the creator to send it again. A private campaign’s link starts
      working once it’s published.
    </CampaignNotice>
  ) : !campaign ? (
    <CampaignNotice error>
      The campaign could not be loaded.{" "}
      <Button variant="link" onClick={() => query.refetch()}>
        Try again
      </Button>
    </CampaignNotice>
  ) : (
    <div className="space-y-6">
      <CampaignHeading
        campaign={campaign}
        isOwner={isCreator(campaign, user?.walletAddress)}
      />
      <CampaignOverview campaign={campaign} />
      {!isAuthenticated ? (
        <JoinPrompt campaign={campaign} onLogIn={logIn} />
      ) : isCreator(campaign, user?.walletAddress) ? (
        <CampaignNotice>
          This is your campaign, opened through its private link.{" "}
          <Link
            href={`/referrals/campaigns/${campaign.id}`}
            className="underline"
          >
            Manage it and review submissions
          </Link>
        </CampaignNotice>
      ) : (
        <ParticipantSubmission campaign={campaign} code={code} />
      )}
    </div>
  );

  return isAuthenticated ? (
    <ResponsiveShell
      title="Campaigns"
      desktopSubtitle="A private campaign, shared with you through its link."
      onBack={() => router.push("/referrals/campaigns")}
      onClose={() => router.push("/referrals")}
    >
      <div className="w-full min-w-0">{body}</div>
    </ResponsiveShell>
  ) : (
    <PublicShell onLogIn={logIn}>{body}</PublicShell>
  );
}

function isCreator(campaign: Campaign, wallet?: string) {
  return (
    !!wallet &&
    wallet.toLowerCase() === campaign.owner.walletAddress.toLowerCase()
  );
}

// For visitors who aren't logged in: the brand and a way to log in, without the signed-in sidebar
function PublicShell({
  children,
  onLogIn,
}: {
  children: ReactNode;
  onLogIn: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <Image
            src="/favicon.ico"
            alt="Reffinity icon"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-[15px] font-semibold leading-tight text-foreground">
              Reffinity
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Referral Program
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onLogIn}>
          Log in
        </Button>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 lg:p-8">{children}</main>
    </div>
  );
}

function JoinPrompt({
  campaign,
  onLogIn,
}: {
  campaign: Campaign;
  onLogIn: () => void;
}) {
  const accepting = acceptsSubmissions(campaign);
  return (
    <section className={`${campaignPanel} space-y-4`}>
      <h2 className="text-lg font-semibold">Take part</h2>
      {accepting ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Log in with your wallet to submit your proof. New to the program? Join
          first, and you’ll come back to this page afterwards.
        </p>
      ) : (
        <CampaignNotice>{closedReason(campaign)}</CampaignNotice>
      )}
      <Button onClick={onLogIn}>
        {accepting
          ? "Log in or join to take part"
          : "Log in to see your submission"}
      </Button>
    </section>
  );
}
