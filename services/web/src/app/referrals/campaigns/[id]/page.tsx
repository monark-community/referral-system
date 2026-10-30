"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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
  CampaignHeading,
  CampaignLoading,
  CampaignNotice,
  CampaignOverview,
  PrivateCampaignLink,
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
  // A private campaign doesn't open by its id, so one you submitted to comes from your own list too
  const joinedPrivate = mine.data?.joined.find(
    ({ campaign }) =>
      campaign.isPrivate && (campaign.id === id || campaign.key === id),
  )?.campaign;
  const fromMine = owned || joinedPrivate;
  const detail = useQuery({
    queryKey: ["campaigns", user?.id, id, "detail"],
    queryFn: () => getCampaign(id),
    enabled: !!mine.data && !fromMine,
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
    refetchInterval: 5000,
  });
  const campaign = fromMine || detail.data?.campaign;
  if (mine.isPending || (!fromMine && detail.isPending && !mine.isError))
    return <CampaignLoading />;
  if (mine.isError || (!fromMine && detail.isError))
    return (
      <div className="space-y-4">
        <Link href="/referrals/campaigns" className="text-sm text-primary">
          All campaigns
        </Link>
        <CampaignNotice error>
          {detail.error instanceof ApiError && detail.error.status === 404
            ? "This campaign could not be found. Drafts are only visible to their creator, and private campaigns open through their link."
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
      <CampaignHeading
        campaign={campaign}
        isOwner={isOwner}
        action={
          isOwner &&
          campaign.status === "DRAFT" && (
            <Button
              variant="outline"
              disabled={publishing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Back to campaign" : "Edit draft"}
            </Button>
          )
        }
      />
      {editing && isOwner && campaign.status === "DRAFT" ? (
        <CampaignForm campaign={campaign} onSaved={() => setEditing(false)} />
      ) : (
        <>
          <CampaignOverview campaign={campaign}>
            {isOwner && (
              <CampaignNotice>
                {campaign.status !== "DRAFT"
                  ? "You created this campaign. Review participant submissions below. Creators cannot complete their own campaigns."
                  : campaign.isPrivate
                    ? "This draft is visible only to you. It’s private, so it won’t be on the campaign board: after you publish it with your wallet, you’ll get a link to share."
                    : "This draft is visible only to you. Publish it with your wallet when you’re ready."}
              </CampaignNotice>
            )}
          </CampaignOverview>
          {isOwner ? (
            <>
              <section className={`${campaignPanel} space-y-4`}>
                <h2 className="text-lg font-semibold">Manage campaign</h2>
                {campaign.isPrivate &&
                  campaign.privateCode &&
                  (campaign.status === "ACTIVE" ||
                    campaign.status === "PAUSED") && (
                    <PrivateCampaignLink code={campaign.privateCode} />
                  )}
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
