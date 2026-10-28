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
  type MyCampaigns,
} from "@/lib/api/campaigns";
import { useAuth } from "@/contexts/auth-context";
import { campaignError } from "@/hooks/use-campaign-transaction";
import { campaignField, campaignPanel, CampaignNotice } from "./campaign-ui";

function localDate(date: string) {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
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
  const [points, setPoints] = useState(
    String(campaign?.reward.completerPoints ?? 30),
  );
  const [pool, setPool] = useState(
    String(campaign?.reward.referralPoolPoints ?? 10),
  );
  const [spots, setSpots] = useState(String(campaign?.maxCompletions ?? 50));
  const [end, setEnd] = useState(campaign ? localDate(campaign.endsAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const completerPoints = Number(points),
      referralPoolPoints = Number(pool),
      maxCompletions = Number(spots);
    if (
      ![completerPoints, referralPoolPoints, maxCompletions].every(
        Number.isSafeInteger,
      ) ||
      completerPoints < 0 ||
      referralPoolPoints < 0 ||
      maxCompletions < 1 ||
      completerPoints + referralPoolPoints < 1
    ) {
      setError(
        "Use whole numbers, at least one spot, and at least one point in the reward or referral pool.",
      );
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
      const input = {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        category,
        completerPoints,
        referralPoolPoints,
        maxCompletions,
        endsAt: new Date(end).toISOString(),
      };
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
          The referral pool is shared 80/20 between the participant’s referrer
          and their referrer. The allowed reward maximum is checked when you
          save.
        </p>
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
            {Number(points || 0).toLocaleString()}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              points
            </span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            + {Number(pool || 0).toLocaleString()} referral pool points
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          You can edit a draft any time. Campaign details are fixed after
          publishing.
        </p>
      </aside>
    </form>
  );
}
