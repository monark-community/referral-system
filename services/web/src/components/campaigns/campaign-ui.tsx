"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Megaphone,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Campaign, CampaignSubmission } from "@/lib/api/campaigns";

export const campaignPanel = "rounded-xl bg-card/50 p-5 lg:p-6 surface-card";
export const campaignField =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
export const categoryLabels = {
  SOCIAL_MEDIA: "Social media",
  COMMUNITY: "Community",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
  SUBMITTED: "Awaiting wallet confirmation",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approval pending",
  REJECTED: "Rejected",
  REWARDED: "Rewarded",
};

export function CampaignBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        {
          "bg-green-500/10 text-green-400": ["ACTIVE", "REWARDED"].includes(
            status,
          ),
          "bg-primary/10 text-orange-300": [
            "UNDER_REVIEW",
            "APPROVED",
            "SUBMITTED",
          ].includes(status),
          "bg-red-500/10 text-red-300": ["REJECTED", "CANCELLED"].includes(
            status,
          ),
          "bg-secondary text-muted-foreground": [
            "DRAFT",
            "PAUSED",
            "ENDED",
          ].includes(status),
        },
      )}
    >
      {statusLabels[status] || status}
    </span>
  );
}

export function CampaignNotice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg border p-3 text-sm leading-relaxed",
        error
          ? "border-red-500/30 bg-red-500/5 text-red-300"
          : "border-primary/20 bg-primary/5 text-orange-200",
      )}
    >
      {children}
    </div>
  );
}

export function CampaignLoading() {
  return (
    <div
      role="status"
      aria-label="Loading campaigns"
      className="space-y-4 animate-pulse"
    >
      <div className="h-16 rounded-xl bg-secondary" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 rounded-xl bg-secondary/50" />
        ))}
      </div>
      <span className="sr-only">Loading campaigns…</span>
    </div>
  );
}

export function CampaignEmpty({
  title,
  description,
  onReset,
}: {
  title: string;
  description: string;
  onReset?: () => void;
}) {
  return (
    <div className={cn(campaignPanel, "py-14 text-center")}>
      <Megaphone
        aria-hidden
        className="mx-auto mb-4 h-9 w-9 text-muted-foreground/40"
      />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {onReset && (
        <Button variant="outline" className="mt-5" onClick={onReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

export function CampaignCard({
  campaign,
  fulfillment,
}: {
  campaign: Campaign;
  fulfillment?: CampaignSubmission;
}) {
  return (
    <Link
      href={`/referrals/campaigns/${campaign.id}`}
      className={cn(
        campaignPanel,
        "group flex flex-col gap-4 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {categoryLabels[campaign.category]}
        </span>
        <CampaignBadge status={fulfillment?.status || campaign.status} />
      </div>
      <div>
        <h2 className="text-lg font-semibold leading-snug group-hover:text-primary transition-colors">
          {campaign.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {campaign.description ||
            "Complete the task and submit your proof to earn points."}
        </p>
      </div>
      <div className="mt-auto flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-orange-400">
          {campaign.reward.completerPoints.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground">
          points per completion
        </span>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          {campaign.spotsLeft} of {campaign.maxCompletions} spots left
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5" />
          Ends {new Date(campaign.endsAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border/50 pt-4 text-xs">
        <span className="truncate text-muted-foreground">
          By {campaign.owner.name || shortWallet(campaign.owner.walletAddress)}
        </span>
        <span className="flex items-center gap-1 text-primary">
          {campaign.status === "DRAFT" ? "Continue draft" : "View campaign"}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
      {campaign.submissions && (
        <p className="text-xs text-muted-foreground">
          {campaign.submissions.UNDER_REVIEW} awaiting review ·{" "}
          {campaign.submissions.REWARDED} rewarded
        </p>
      )}
    </Link>
  );
}

export function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function SubmissionProgress({
  fulfillment,
}: {
  fulfillment: CampaignSubmission;
}) {
  const rejected = fulfillment.status === "REJECTED";
  const steps = [
    { title: "Proof saved", done: true },
    { title: "Submitted on chain", done: !!fulfillment.submission },
    {
      title: rejected ? "Rejected" : "Creator review",
      done: !!fulfillment.decision,
    },
    ...(!rejected
      ? [{ title: "Points rewarded", done: !!fulfillment.reward }]
      : []),
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {steps.map((step) => (
        <li
          key={step.title}
          className={cn(
            "flex items-center gap-2 text-sm",
            step.done ? "text-green-400" : "text-muted-foreground",
          )}
        >
          {step.done ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Clock3 className="h-4 w-4" />
          )}
          {step.title}
        </li>
      ))}
    </ol>
  );
}

export function SafeProof({ proof }: { proof: string }) {
  let url: URL | undefined;
  try {
    const parsed = new URL(proof);
    if (["http:", "https:"].includes(parsed.protocol)) url = parsed;
  } catch {
    /* Community proof is plain text. */
  }
  return url ? (
    <a
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-primary underline underline-offset-4"
    >
      {proof}
    </a>
  ) : (
    <p className="whitespace-pre-wrap break-words text-sm">{proof}</p>
  );
}

export function CampaignHelp() {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">
      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Complete one task, submit proof, and earn points after the creator
        approves. Each person can submit once. Your referrer and their referrer
        may also earn a share of the referral pool.
      </p>
    </div>
  );
}
