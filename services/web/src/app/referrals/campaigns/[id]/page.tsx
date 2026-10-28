"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users } from "lucide-react";
import { useMyCampaigns } from "@/lib/api/campaign-hooks";
import { getCampaign } from "@/lib/api/campaigns";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import {
  CampaignReviewQueue,
  CampaignStatusControls,
  CampaignTransactionButton,
  ParticipantSubmission,
} from "@/components/campaigns/campaign-actions";
import {
  campaignPanel,
  CampaignBadge,
  CampaignLoading,
  CampaignNotice,
  categoryLabels,
  shortWallet,
} from "@/components/campaigns/campaign-ui";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const mine = useMyCampaigns();
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Drafts are deliberately served only by /mine. Resolve owned campaigns there first.
  const owned = mine.data?.created.find(
    (item) => item.id === id || item.key === id,
  );
  const detail = useQuery({
    queryKey: ["campaigns", user?.id, id, "detail"],
    queryFn: () => getCampaign(id),
    enabled: !!mine.data && !owned,
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
    refetchInterval: 5000,
  });
  const campaign = owned || detail.data?.campaign;
  if (mine.isPending || (!owned && detail.isPending && !mine.isError))
    return <CampaignLoading />;
  if (mine.isError || (!owned && detail.isError))
    return (
      <div className="space-y-4">
        <Link href="/referrals/campaigns" className="text-sm text-primary">
          All campaigns
        </Link>
        <CampaignNotice error>
          {detail.error instanceof ApiError && detail.error.status === 404
            ? "This campaign could not be found. Drafts are only visible to their creator."
            : "The campaign could not be loaded."}
          <Button
            variant="link"
            onClick={() => (mine.isError ? mine.refetch() : detail.refetch())}
          >
            Try again
          </Button>
        </CampaignNotice>
      </div>
    );
  if (!campaign) return null;
  if (campaign.isSystem)
    return (
      <CampaignNotice>
        This is the built-in referral campaign.{" "}
        <Link href="/referrals" className="underline">
          Open your referral dashboard
        </Link>{" "}
        to invite friends.
      </CampaignNotice>
    );
  const isOwner = !!owned;
  return (
    <div className="space-y-6">
      <Link
        href="/referrals/campaigns"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {categoryLabels[campaign.category]}
            </span>
            <CampaignBadge status={campaign.status} />
          </div>
          <h1 className="break-words text-2xl font-semibold lg:text-3xl">
            {campaign.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Created by{" "}
            {campaign.owner.name || shortWallet(campaign.owner.walletAddress)}
            {isOwner && " (you)"}
          </p>
        </div>
        {isOwner && campaign.status === "DRAFT" && (
          <Button
            variant="outline"
            disabled={publishing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Back to campaign" : "Edit draft"}
          </Button>
        )}
      </div>
      {editing && isOwner && campaign.status === "DRAFT" ? (
        <CampaignForm campaign={campaign} onSaved={() => setEditing(false)} />
      ) : (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className={`${campaignPanel} min-w-0 space-y-5`}>
              {campaign.description && (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                  {campaign.description}
                </p>
              )}
              <div>
                <h2 className="mb-3 text-lg font-semibold">
                  What you need to do
                </h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {campaign.instructions}
                </p>
              </div>
              <div className="border-t border-border pt-4 text-sm text-muted-foreground">
                <p>Proof is checked by the campaign creator.</p>
                <p className="mt-1">
                  {campaign.category === "SOCIAL_MEDIA"
                    ? "Submit a link to your post or profile."
                    : "Submit your community username or a short text."}
                </p>
              </div>
              {isOwner && (
                <CampaignNotice>
                  {campaign.status === "DRAFT"
                    ? "This draft is visible only to you. Publish it with your wallet when you’re ready."
                    : "You created this campaign. Review participant submissions below. Creators cannot complete their own campaigns."}
                </CampaignNotice>
              )}
            </section>
            <aside className={`${campaignPanel} space-y-5`}>
              <div>
                <p className="text-xs text-muted-foreground">
                  Completion reward
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-primary">
                  {campaign.reward.completerPoints.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    points
                  </span>
                </p>
              </div>
              <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {campaign.spotsLeft} of {campaign.maxCompletions} spots left
                </p>
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Ends {new Date(campaign.endsAt).toLocaleString()}</span>
                </p>
                <p className="pt-2">
                  + {campaign.reward.referralPoolPoints} referral pool points
                  per completion, shared 80/20.
                </p>
              </div>
            </aside>
          </div>
          {isOwner ? (
            <>
              <section className={`${campaignPanel} space-y-4`}>
                <h2 className="text-lg font-semibold">Manage campaign</h2>
                {campaign.status === "DRAFT" && campaign.chain && (
                  <CampaignTransactionButton
                    call={campaign.chain}
                    label="Publish campaign in wallet"
                    onBusyChange={setPublishing}
                  />
                )}
                <CampaignStatusControls
                  campaign={campaign}
                  disabled={publishing}
                />
              </section>
              {campaign.status !== "DRAFT" && (
                <CampaignReviewQueue campaign={campaign} />
              )}
            </>
          ) : (
            <ParticipantSubmission campaign={campaign} />
          )}
        </>
      )}
    </div>
  );
}
