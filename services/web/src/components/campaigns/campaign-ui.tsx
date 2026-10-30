"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Copy,
  Lock,
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

/** The page a private campaign's link opens. It sits outside /referrals so it works without a login. */
export const privateCampaignPath = (code: string) =>
  `/campaigns/private/${encodeURIComponent(code)}`;

export function acceptsSubmissions(campaign: Campaign) {
  return (
    campaign.status === "ACTIVE" &&
    campaign.spotsLeft > 0 &&
    new Date(campaign.endsAt).getTime() > Date.now()
  );
}

export function closedReason(campaign: Campaign) {
  return campaign.status === "PAUSED"
    ? "This campaign is paused. Check back when the creator resumes it."
    : campaign.spotsLeft === 0
      ? "All spots have been taken."
      : "This campaign is no longer accepting submissions.";
}

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

export function PrivateTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <Lock aria-hidden className="h-3 w-3" />
      Private
    </span>
  );
}

/** The creator's copy of a private campaign's link, the one way other people can open it. */
export function PrivateCampaignLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}${privateCampaignPath(code)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link stays selectable in the field. */
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Private link</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        This campaign isn’t on the campaign board. Anyone with this link can
        view it, and they need to log in to take part. The link never changes,
        so share it only with people you want to invite.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background p-1.5 pl-3">
        <input
          aria-label="Private campaign link"
          className="min-w-0 flex-1 truncate bg-transparent font-mono text-sm outline-none"
          value={link}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <Check aria-hidden className="h-4 w-4" />
          ) : (
            <Copy aria-hidden className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

export function CampaignHeading({
  campaign,
  isOwner = false,
  action,
}: {
  campaign: Campaign;
  isOwner?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {categoryLabels[campaign.category]}
          </span>
          <CampaignBadge status={campaign.status} />
          {campaign.isPrivate && <PrivateTag />}
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
      {action}
    </div>
  );
}

/** The task and its reward. `children` goes under the task, e.g. a note for the creator. */
export function CampaignOverview({
  campaign,
  children,
}: {
  campaign: Campaign;
  children?: ReactNode;
}) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className={`${campaignPanel} min-w-0 space-y-5`}>
        {campaign.description && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {campaign.description}
          </p>
        )}
        <div>
          <h2 className="mb-3 text-lg font-semibold">What you need to do</h2>
          {campaign.instructions === undefined ? (
            // Your own list doesn't carry a private campaign's task; its link does
            <p className="text-sm leading-relaxed text-muted-foreground">
              Open the private link the creator sent you to see the full task.
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {campaign.instructions}
            </p>
          )}
        </div>
        <div className="border-t border-border pt-4 text-sm text-muted-foreground">
          <p>Proof is checked by the campaign creator.</p>
          <p className="mt-1">
            {campaign.category === "SOCIAL_MEDIA"
              ? "Submit a link to your post or profile."
              : "Submit your community username or a short text."}
          </p>
        </div>
        {children}
      </section>
      <aside className={`${campaignPanel} space-y-5`}>
        <div>
          <p className="text-xs text-muted-foreground">Completion reward</p>
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
            + {campaign.reward.referralPoolPoints} referral pool points per
            completion, shared 80/20.
          </p>
        </div>
      </aside>
    </div>
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
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {categoryLabels[campaign.category]}
          {campaign.isPrivate && <PrivateTag />}
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
