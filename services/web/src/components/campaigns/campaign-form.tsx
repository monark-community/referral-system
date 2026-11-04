"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  createCampaign,
  updateCampaign,
  type Campaign,
  type CampaignCategory,
  type CampaignInput,
  type MyCampaigns,
} from "@/lib/api/campaigns";
import { useAuth } from "@/contexts/auth-context";
import { campaignError } from "@/hooks/use-campaign-transaction";
import {
  formatNativeAmountExact,
  parseNativeAmountToWei,
} from "@/lib/native-amount";
import { cn } from "@/lib/utils";
import { campaignField, campaignPanel, CampaignNotice } from "./campaign-ui";

const visibilityOptions = [
  {
    id: "public",
    isPrivate: false,
    label: "Public",
    help: "Listed on the campaign board for everyone.",
  },
  {
    id: "private",
    isPrivate: true,
    label: "Private",
    help: "Not on the board. Only people you send its link to can open it.",
  },
];

function localDate(date: string) {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function initialFundingPreview(reward: string, pool: string, runs: string) {
  try {
    const count = Number(runs);
    if (!Number.isSafeInteger(count) || count < 1) return null;
    return formatNativeAmountExact(
      (parseNativeAmountToWei(reward) + parseNativeAmountToWei(pool)) *
        BigInt(count),
    );
  } catch {
    return null;
  }
}

export function CampaignForm({
  campaign,
  onSaved,
}: {
  campaign?: Campaign;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState(campaign?.title || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [instructions, setInstructions] = useState(
    campaign?.instructions || "",
  );
  const [category, setCategory] = useState<CampaignCategory>(
    campaign?.category || "SOCIAL_MEDIA",
  );
  const [rewardType, setRewardType] = useState<"POINTS" | "DIRECT">(
    campaign?.reward.type || "POINTS",
  );
  const [points, setPoints] = useState(
    String(
      campaign?.reward.type === "POINTS"
        ? campaign.reward.completerPoints
        : 30,
    ),
  );
  const [pool, setPool] = useState(
    String(
      campaign?.reward.type === "POINTS"
        ? campaign.reward.referralPoolPoints
        : 10,
    ),
  );
  const [directReward, setDirectReward] = useState(
    campaign?.reward.type === "DIRECT"
      ? formatNativeAmountExact(campaign.reward.completerRewardWei)
      : "0.001",
  );
  const [directPool, setDirectPool] = useState(
    campaign?.reward.type === "DIRECT"
      ? formatNativeAmountExact(campaign.reward.referralPoolWei)
      : "0",
  );
  const [initialFundingRuns, setInitialFundingRuns] = useState(
    String(
      campaign?.reward.type === "DIRECT"
        ? campaign.reward.initialFundingRuns
        : 1,
    ),
  );
  const [spots, setSpots] = useState(String(campaign?.maxCompletions ?? 50));
  const [end, setEnd] = useState(campaign ? localDate(campaign.endsAt) : "");
  const [isPrivate, setIsPrivate] = useState(campaign?.isPrivate ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fundingPreview = initialFundingPreview(
    directReward,
    directPool,
    initialFundingRuns,
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const maxCompletions = Number(spots);
    if (!Number.isSafeInteger(maxCompletions) || maxCompletions < 1) {
      setError("Available completions must be a whole number of at least one.");
      return;
    }
    if (!title.trim() || !instructions.trim()) {
      setError("Add a title and instructions for your task.");
      return;
    }
    if (
      !end ||
      !Number.isFinite(new Date(end).getTime()) ||
      new Date(end).getTime() <= Date.now()
    ) {
      setError("Choose an end date in the future.");
      return;
    }
    setBusy(true);
    try {
      const common = {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        category,
        maxCompletions,
        endsAt: new Date(end).toISOString(),
        isPrivate,
      };
      let input: CampaignInput;
      if (rewardType === "POINTS") {
        const completerPoints = Number(points);
        const referralPoolPoints = Number(pool);
        if (
          ![completerPoints, referralPoolPoints].every(Number.isSafeInteger) ||
          completerPoints < 0 ||
          referralPoolPoints < 0 ||
          completerPoints + referralPoolPoints < 1
        ) {
          throw new Error(
            "Use whole numbers and at least one point in the reward or referral pool.",
          );
        }
        input = {
          ...common,
          rewardType: "POINTS",
          completerPoints,
          referralPoolPoints,
        };
      } else {
        const completerRewardWei = parseNativeAmountToWei(directReward).toString();
        const referralPoolWei = parseNativeAmountToWei(directPool).toString();
        const runs = Number(initialFundingRuns);
        if (
          !Number.isSafeInteger(runs) ||
          runs < 1 ||
          BigInt(completerRewardWei) + BigInt(referralPoolWei) < BigInt(1)
        ) {
          throw new Error(
            "Use at least one funded run and a non-zero completion reward or referral pool.",
          );
        }
        input = {
          ...common,
          rewardType: "DIRECT",
          completerRewardWei,
          referralPoolWei,
          initialFundingRuns: runs,
        };
      }
      const result = campaign
        ? await updateCampaign(campaign.id, input)
        : await createCampaign(input);
      client.setQueryData<MyCampaigns>(
        ["campaigns", user?.id, "mine"],
        (old) => ({
          created: [
            result.campaign,
            ...(old?.created || []).filter(
              (item) => item.id !== result.campaign.id,
            ),
          ],
          joined: old?.joined || [],
        }),
      );
      await client.invalidateQueries({ queryKey: ["campaigns"] });
      if (campaign) onSaved?.();
      else router.push(`/referrals/campaigns/${result.campaign.id}`);
    } catch (err) {
      setError(campaignError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"
    >
      <fieldset
        disabled={busy}
        className={`${campaignPanel} min-w-0 space-y-5`}
      >
        <div>
          <h2 className="text-lg font-semibold">Campaign details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give your community a clear task to complete.
          </p>
        </div>
        <label className="block space-y-2 text-sm">
          <span>Campaign title</span>
          <input
            className={campaignField}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="e.g. Share our launch with your community"
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span id="campaign-category-label">Category</span>
          <select
            aria-labelledby="campaign-category-label"
            className={campaignField}
            value={category}
            onChange={(e) => setCategory(e.target.value as CampaignCategory)}
          >
            <option value="SOCIAL_MEDIA">Social media</option>
            <option value="COMMUNITY">Community</option>
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span>
            Short description{" "}
            <span className="text-muted-foreground">(optional)</span>
          </span>
          <textarea
            className={campaignField}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="A quick overview for the campaign board"
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span id="campaign-instructions-label">Task instructions</span>
          <textarea
            aria-labelledby="campaign-instructions-label"
            aria-describedby="campaign-instructions-help"
            className={campaignField}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            rows={5}
            required
            placeholder="Explain what to do, where to do it, and what proof to submit."
          />
          <span
            id="campaign-instructions-help"
            className="block text-xs text-muted-foreground"
          >
            {category === "SOCIAL_MEDIA"
              ? "Participants submit a link to their post or profile."
              : "Participants submit a username or short text as proof."}{" "}
            You review each submission yourself.
          </span>
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2">Reward type</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  type: "POINTS",
                  label: "Points",
                  help: "Reward participants with Reffinity points.",
                },
                {
                  type: "DIRECT",
                  label: "Direct",
                  help: "Fund rewards with the chain’s native currency.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.type}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  rewardType === option.type
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-secondary/40",
                )}
              >
                <input
                  type="radio"
                  name="campaign-reward-type"
                  className="mt-1 accent-orange-500"
                  checked={rewardType === option.type}
                  onChange={() => setRewardType(option.type)}
                  aria-describedby={`campaign-reward-${option.type.toLowerCase()}-help`}
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span
                    id={`campaign-reward-${option.type.toLowerCase()}-help`}
                    className="mt-0.5 block text-xs text-muted-foreground"
                  >
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {rewardType === "POINTS" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>Completion reward (points)</span>
                <input
                  className={campaignField}
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>Referral pool (points)</span>
                <input
                  className={campaignField}
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={pool}
                  onChange={(e) => setPool(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              The referral pool is shared 80/20 between the participant’s
              referrer and their referrer. The allowed reward maximum is checked
              when you save.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>Completion reward (native currency)</span>
                <input
                  className={campaignField}
                  type="text"
                  inputMode="decimal"
                  required
                  value={directReward}
                  onChange={(e) => setDirectReward(e.target.value)}
                  placeholder="0.001"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span>Referral pool (native currency)</span>
                <input
                  className={campaignField}
                  type="text"
                  inputMode="decimal"
                  required
                  value={directPool}
                  onChange={(e) => setDirectPool(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span>Initially funded completions</span>
              <input
                className={campaignField}
                type="number"
                min="1"
                step="1"
                required
                value={initialFundingRuns}
                onChange={(e) => setInitialFundingRuns(e.target.value)}
              />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Publishing deposits the completion reward and referral pool for
              each initially funded completion into the campaign contract. The
              referral pool is shared 80/20.
            </p>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>Available completions</span>
            <input
              className={campaignField}
              type="number"
              min="1"
              step="1"
              required
              value={spots}
              onChange={(e) => setSpots(e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span id="campaign-end-label">End date and time</span>
            <input
              aria-labelledby="campaign-end-label"
              aria-describedby="campaign-end-help"
              className={`${campaignField} [color-scheme:dark]`}
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
            <span
              id="campaign-end-help"
              className="block text-xs text-muted-foreground"
            >
              Your local time
            </span>
          </label>
        </div>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2">Visibility</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibilityOptions.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  isPrivate === option.isPrivate
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-secondary/40",
                )}
              >
                <input
                  type="radio"
                  name="campaign-visibility"
                  className="mt-1 accent-orange-500"
                  checked={isPrivate === option.isPrivate}
                  onChange={() => setIsPrivate(option.isPrivate)}
                  aria-labelledby={`campaign-visibility-${option.id}`}
                  aria-describedby={`campaign-visibility-${option.id}-help`}
                />
                <span>
                  <span
                    id={`campaign-visibility-${option.id}`}
                    className="block font-medium"
                  >
                    {option.label}
                  </span>
                  <span
                    id={`campaign-visibility-${option.id}-help`}
                    className="mt-0.5 block text-xs text-muted-foreground"
                  >
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You can change this until you publish.
          </p>
        </fieldset>
        {error && <CampaignNotice error>{error}</CampaignNotice>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : campaign ? "Save changes" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              campaign ? onSaved?.() : router.push("/referrals/campaigns")
            }
          >
            Cancel
          </Button>
        </div>
      </fieldset>
      <aside className={`${campaignPanel} space-y-4`}>
        <h2 className="font-semibold">Ready when you are</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Save a draft first. Review the details, then publish it with your
          wallet to open it to participants.
        </p>
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Reward per completion</p>
          <p className="mt-1 text-3xl font-semibold text-primary">
            {rewardType === "POINTS"
              ? Number(points || 0).toLocaleString()
              : directReward || "0"}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {rewardType === "POINTS" ? "points" : "native currency"}
            </span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            +{" "}
            {rewardType === "POINTS"
              ? `${Number(pool || 0).toLocaleString()} referral pool points`
              : `${directPool || "0"} native referral pool`}
          </p>
        </div>
        {rewardType === "DIRECT" && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              Initial wallet funding
            </p>
            <p className="mt-1 break-all text-lg font-semibold text-primary">
              {fundingPreview ?? "—"} native currency
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This is deposited when you publish, not when you save the draft.
            </p>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          You can edit a draft any time. Campaign details are fixed after
          publishing.
        </p>
      </aside>
    </form>
  );
}
