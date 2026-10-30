"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  campaignError,
  useCampaignTransaction,
} from "@/hooks/use-campaign-transaction";
import { useAuth } from "@/contexts/auth-context";
import { useRefreshCampaigns } from "@/lib/api/campaign-hooks";
import { ApiError } from "@/lib/api/client";
import {
  changeCampaignStatus,
  getCampaignSubmissions,
  getMySubmission,
  reviewCampaignSubmission,
  submitCampaignProof,
  type Campaign,
  type CampaignCall,
  type CampaignStatus,
  type CampaignSubmission,
} from "@/lib/api/campaigns";
import {
  acceptsSubmissions,
  campaignField,
  campaignPanel,
  CampaignBadge,
  CampaignEmpty,
  CampaignLoading,
  CampaignNotice,
  closedReason,
  SafeProof,
  shortWallet,
  SubmissionProgress,
} from "./campaign-ui";

export function CampaignTransactionButton({
  call,
  label,
  prepare,
  disabled = false,
  onBusyChange,
}: {
  call?: CampaignCall;
  label: string;
  prepare?: () => Promise<CampaignCall | null>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const transaction = useCampaignTransaction();
  const refresh = useRefreshCampaigns();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const busy = saving || transaction.busy;
  useEffect(() => {
    onBusyChange?.(busy || confirmed);
  }, [busy, confirmed, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function run() {
    setError("");
    setSaving(true);
    try {
      const next = prepare ? await prepare() : call;
      if (!next)
        throw new Error(
          "This action is no longer available. Refresh the campaign.",
        );
      await transaction.send(next);
      setConfirmed(true);
    } catch (err) {
      setError(campaignError(err));
    } finally {
      setSaving(false);
      await refresh();
    }
  }
  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={disabled || busy || confirmed}>
        {transaction.phase === "wallet"
          ? "Confirm in your wallet…"
          : transaction.phase === "confirming"
            ? "Confirming transaction…"
            : saving
              ? "Saving…"
              : confirmed
                ? "Confirmed · updating…"
                : label}
      </Button>
      {confirmed && (
        <CampaignNotice>
          Transaction confirmed. Your campaign will update shortly. You can
          leave this page and return later.
        </CampaignNotice>
      )}
      {error && <CampaignNotice error>{error}</CampaignNotice>}
    </div>
  );
}

export function CampaignStatusControls({
  campaign,
  disabled = false,
}: {
  campaign: Campaign;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<Exclude<CampaignStatus, "DRAFT"> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshCampaigns();
  // Cancel throws a draft away; once published, the campaign is ended instead
  const actions =
    campaign.status === "ACTIVE"
      ? (["PAUSED", "ENDED"] as const)
      : campaign.status === "PAUSED"
        ? (["ACTIVE", "ENDED"] as const)
        : campaign.status === "DRAFT"
          ? (["CANCELLED"] as const)
          : [];
  const labels = {
    PAUSED: "Pause campaign",
    ACTIVE: "Resume campaign",
    ENDED: "End campaign",
    CANCELLED: "Cancel campaign",
  };
  async function change(status: Exclude<CampaignStatus, "DRAFT">) {
    setBusy(true);
    setError("");
    try {
      await changeCampaignStatus(campaign.id, status);
      setTarget(null);
      await refresh();
    } catch (err) {
      setError(campaignError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((status) => (
          <Button
            key={status}
            variant="outline"
            size="sm"
            disabled={busy || disabled}
            onClick={() =>
              ["ENDED", "CANCELLED"].includes(status)
                ? setTarget(status)
                : change(status)
            }
          >
            {labels[status]}
          </Button>
        ))}
      </div>
      {target && (
        <div className="rounded-lg border border-border p-4 text-sm">
          <p>
            {target === "ENDED"
              ? "This will permanently end the campaign and stop new submissions. You can still review existing submissions."
              : "This will permanently cancel this draft. It can’t be published afterwards."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => change(target)}
            >
              {busy ? "Updating…" : labels[target]}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Keep campaign
            </Button>
          </div>
        </div>
      )}
      {error && <CampaignNotice error>{error}</CampaignNotice>}
    </div>
  );
}

/** A participant's proof and progress. `code` is the private link's code, needed to submit to a private campaign. */
export function ParticipantSubmission({
  campaign,
  code,
}: {
  campaign: Campaign;
  code?: string;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const refresh = useRefreshCampaigns();
  const queryKey = ["campaigns", user?.id, campaign.id, "submission"];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      getMySubmission(campaign.id).catch((err: unknown) => {
        // A private campaign stays unknown to you until you submit; opened by its link, that means "nothing yet"
        if (code && err instanceof ApiError && err.status === 404)
          return { fulfillment: null };
        throw err;
      }),
    refetchInterval: 5000,
  });
  const [proof, setProof] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fulfillment = query.data?.fulfillment;
  useEffect(() => {
    if (fulfillment?.rewardedAt) void refresh();
  }, [fulfillment?.rewardedAt, refresh]);
  const accepting = acceptsSubmissions(campaign);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await submitCampaignProof(
        campaign.id,
        proof.trim(),
        code,
      );
      client.setQueryData(queryKey, result);
      await refresh();
    } catch (err) {
      setError(campaignError(err));
      await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <CampaignLoading />;
  if (query.isError)
    return (
      <CampaignNotice error>
        Your submission could not be loaded.{" "}
        <Button variant="link" onClick={() => query.refetch()}>
          Try again
        </Button>
      </CampaignNotice>
    );
  return (
    <section className={`${campaignPanel} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {fulfillment ? "Your submission" : "Submit your proof"}
        </h2>
        {fulfillment && <CampaignBadge status={fulfillment.status} />}
      </div>
      {fulfillment ? (
        <>
          <SubmissionProgress fulfillment={fulfillment} />
          <div className="rounded-lg bg-secondary/40 p-4">
            <p className="mb-2 text-xs text-muted-foreground">Your proof</p>
            <SafeProof proof={fulfillment.proof} />
          </div>
          {fulfillment.rejectionReason && (
            <CampaignNotice error>
              Creator’s feedback: {fulfillment.rejectionReason}
              {!fulfillment.rejectedAt && " (awaiting confirmation)"}
            </CampaignNotice>
          )}
          {fulfillment.status === "SUBMITTED" && fulfillment.chain && (
            <>
              <p className="text-sm text-muted-foreground">
                Your proof is saved. Confirm the submission with your wallet to
                send it for review.
              </p>
              <CampaignTransactionButton
                call={fulfillment.chain}
                label="Confirm submission in wallet"
              />
            </>
          )}
          {fulfillment.status === "UNDER_REVIEW" && (
            <p className="text-sm text-muted-foreground">
              The creator is reviewing your proof. Your reward will arrive after
              approval.
            </p>
          )}
          {fulfillment.status === "APPROVED" && (
            <CampaignNotice>
              Your proof has been approved. Your reward is awaiting the
              creator’s wallet confirmation.
            </CampaignNotice>
          )}
          {fulfillment.status === "REWARDED" && (
            <p className="text-sm text-green-400">
              You earned {fulfillment.completerReward.toLocaleString()} points.
              Your reward is confirmed.
            </p>
          )}
          {fulfillment.status === "REJECTED" && fulfillment.rejectedAt && (
            <p className="text-sm text-muted-foreground">
              This submission is final. Each person can submit to a campaign
              once.
            </p>
          )}
        </>
      ) : accepting ? (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {campaign.category === "SOCIAL_MEDIA"
              ? "Share a link to your post or profile so the creator can check your task."
              : "Share your community username or a short description of what you completed."}
          </p>
          <label className="block space-y-2 text-sm">
            <span>
              {campaign.category === "SOCIAL_MEDIA"
                ? "Proof link"
                : "Username or proof"}
            </span>
            {campaign.category === "SOCIAL_MEDIA" ? (
              <input
                className={campaignField}
                type="url"
                required
                maxLength={500}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                placeholder="https://…"
                disabled={busy}
              />
            ) : (
              <textarea
                className={campaignField}
                required
                maxLength={500}
                rows={3}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                placeholder="Your username and any details the creator requested"
                disabled={busy}
              />
            )}
          </label>
          <p className="text-xs text-muted-foreground">
            You can submit once, including if rejected. After saving proof,
            you’ll confirm the submission with your wallet.
          </p>
          {error && <CampaignNotice error>{error}</CampaignNotice>}
          <Button type="submit" disabled={busy || !proof.trim()}>
            {busy ? "Saving…" : "Save proof & continue"}
          </Button>
        </form>
      ) : (
        <CampaignNotice>{closedReason(campaign)}</CampaignNotice>
      )}
    </section>
  );
}

function ReviewSubmission({
  campaign,
  fulfillment,
}: {
  campaign: Campaign;
  fulfillment: CampaignSubmission;
}) {
  const client = useQueryClient();
  const { user } = useAuth();
  const refresh = useRefreshCampaigns();
  const transaction = useCampaignTransaction();
  const [rejecting, setRejecting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reason, setReason] = useState(fulfillment.rejectionReason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const busy = saving || transaction.busy;
  const reviewable =
    ["UNDER_REVIEW", "APPROVED", "REJECTED"].includes(fulfillment.status) &&
    !fulfillment.verifiedAt &&
    !fulfillment.rejectedAt;
  const pending =
    (fulfillment.status === "APPROVED" || fulfillment.status === "REJECTED") &&
    !changing;
  const actionLabel =
    transaction.phase === "wallet"
      ? "Confirm in your wallet…"
      : transaction.phase === "confirming"
        ? "Confirming transaction…"
        : saving
          ? "Saving…"
          : null;
  async function decide(decision?: "approve" | "reject") {
    setError("");
    setSaving(true);
    try {
      let call = fulfillment.chain;
      if (decision) {
        const result = await reviewCampaignSubmission(
          campaign.id,
          fulfillment.id,
          decision,
          reason.trim(),
        );
        client.setQueryData<{ fulfillments: CampaignSubmission[] }>(
          ["campaigns", user?.id, campaign.id, "reviews"],
          (old) => ({
            fulfillments: (old?.fulfillments || []).map((item) =>
              item.id === fulfillment.id ? result.fulfillment : item,
            ),
          }),
        );
        call = result.fulfillment.chain;
        setChanging(false);
        setRejecting(false);
      }
      if (!call)
        throw new Error(
          "This decision is no longer available. Refresh the campaign.",
        );
      await transaction.send(call);
      setConfirmed(true);
    } catch (err) {
      setError(campaignError(err));
    } finally {
      setSaving(false);
      await refresh();
    }
  }
  return (
    <article className="space-y-4 rounded-xl border border-border/60 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {fulfillment.participant?.name ||
              (fulfillment.participant
                ? shortWallet(fulfillment.participant.walletAddress)
                : "Participant")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {fulfillment.participant &&
              shortWallet(fulfillment.participant.walletAddress)}{" "}
            · {new Date(fulfillment.createdAt).toLocaleString()}
          </p>
        </div>
        <CampaignBadge status={fulfillment.status} />
      </div>
      <div className="rounded-lg bg-secondary/40 p-3">
        <SafeProof proof={fulfillment.proof} />
      </div>
      {fulfillment.rejectionReason && (
        <p className="text-sm text-muted-foreground">
          Feedback: {fulfillment.rejectionReason}
        </p>
      )}
      {fulfillment.status === "SUBMITTED" && (
        <p className="text-xs text-muted-foreground">
          Waiting for the participant to confirm their submission in their
          wallet.
        </p>
      )}
      {error && <CampaignNotice error>{error}</CampaignNotice>}
      {confirmed && reviewable && (
        <CampaignNotice>
          Transaction confirmed. The submission will update shortly.
        </CampaignNotice>
      )}
      {reviewable && !confirmed && (
        <div className="space-y-3">
          {pending && fulfillment.chain ? (
            <>
              <Button disabled={busy} onClick={() => decide()}>
                {actionLabel ||
                  `Confirm ${fulfillment.status === "APPROVED" ? "approval" : "rejection"} in wallet`}
              </Button>
              <p className="text-xs text-muted-foreground">
                This decision becomes final after wallet confirmation.
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setChanging(true)}
              >
                Change decision
              </Button>
            </>
          ) : rejecting ? (
            <>
              <label className="block space-y-2 text-sm">
                <span>Reason for rejection</span>
                <textarea
                  className={campaignField}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                  disabled={busy}
                  placeholder="Explain what didn’t meet the instructions"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy || !reason.trim()}
                  onClick={() => decide("reject")}
                >
                  {actionLabel || "Reject & confirm in wallet"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRejecting(false)}
                >
                  Keep reviewing
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              <Button disabled={busy} onClick={() => decide("approve")}>
                {actionLabel ||
                  `Approve & pay ${campaign.reward.completerPoints} points`}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                Reject submission
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function CampaignReviewQueue({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState("ALL");
  const query = useQuery({
    queryKey: ["campaigns", user?.id, campaign.id, "reviews"],
    queryFn: () => getCampaignSubmissions(campaign.id),
    refetchInterval: 5000,
  });
  const fulfillments = query.data?.fulfillments || [];
  const filtered = fulfillments.filter(
    (item) => filter === "ALL" || item.status === filter,
  );
  return (
    <section className={`${campaignPanel} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Submission review queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the proof, then approve the reward or explain a rejection.
          </p>
        </div>
        <label>
          <span className="sr-only">Filter submissions</span>
          <select
            className={campaignField}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All submissions ({fulfillments.length})</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="SUBMITTED">Awaiting participant</option>
            <option value="APPROVED">Approval pending</option>
            <option value="REJECTED">Rejected</option>
            <option value="REWARDED">Rewarded</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <CampaignLoading />
      ) : query.isError ? (
        <CampaignNotice error>
          Submissions could not be loaded.{" "}
          <Button variant="link" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CampaignNotice>
      ) : filtered.length ? (
        <div className="space-y-4">
          {filtered.map((fulfillment) => (
            <ReviewSubmission
              key={fulfillment.id}
              campaign={campaign}
              fulfillment={fulfillment}
            />
          ))}
        </div>
      ) : (
        <CampaignEmpty
          title="No submissions to show"
          description={
            filter === "ALL"
              ? "Submissions will appear here when participants save their proof."
              : "No submissions match this status."
          }
        />
      )}
    </section>
  );
}
