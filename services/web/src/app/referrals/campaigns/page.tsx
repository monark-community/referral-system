"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, ArrowUpRight } from "lucide-react";
import { useCampaignBoard, useMyCampaigns } from "@/lib/api/campaign-hooks";
import {
  CampaignBadge,
  CampaignCard,
  CampaignEmpty,
  CampaignHelp,
  CampaignLoading,
  CampaignNotice,
  campaignField,
} from "@/components/campaigns/campaign-ui";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CampaignsPage() {
  const board = useCampaignBoard();
  const mine = useMyCampaigns();
  const [tab, setTab] = useState<"discover" | "created" | "joined">("discover");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const activeQuery = tab === "discover" ? board : mine;
  const campaigns =
    tab === "discover"
      ? (board.data?.campaigns || []).filter((c) => !c.isSystem)
      : tab === "created"
        ? mine.data?.created || []
        : (mine.data?.joined || []).map((item) => item.campaign);
  const filtered = campaigns.filter(
    (c) =>
      (category === "ALL" || c.category === category) &&
      `${c.title} ${c.description} ${c.owner.name || ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const system = board.data?.campaigns.find((c) => c.isSystem);
  const tabs = [
    { id: "discover", label: "Discover" },
    { id: "created", label: "Created by me" },
    { id: "joined", label: "My submissions" },
  ] as const;
  const reset = () => {
    setSearch("");
    setCategory("ALL");
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/referrals/campaigns/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" />
          Create campaign
        </Link>
      </div>
      <CampaignHelp />
      <div
        className="flex flex-wrap gap-2 border-b border-border/60"
        role="tablist"
        aria-label="Campaign lists"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="campaign-list"
            id={`tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              "border-b-2 px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === item.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.id === "created" && mine.data
              ? ` (${mine.data.created.length})`
              : item.id === "joined" && mine.data
                ? ` (${mine.data.joined.length})`
                : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search campaigns</span>
          <Search
            aria-hidden
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          />
          <input
            className={`${campaignField} pl-9`}
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select
            className={campaignField}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="ALL">All categories</option>
            <option value="SOCIAL_MEDIA">Social media</option>
            <option value="COMMUNITY">Community</option>
          </select>
        </label>
      </div>
      <div id="campaign-list" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {activeQuery.isPending ? (
          <CampaignLoading />
        ) : activeQuery.isError ? (
          <CampaignNotice error>
            Campaigns could not be loaded.{" "}
            <Button variant="link" onClick={() => activeQuery.refetch()}>
              Try again
            </Button>
          </CampaignNotice>
        ) : filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                fulfillment={
                  tab === "joined"
                    ? mine.data?.joined.find(
                        (item) => item.campaign.id === campaign.id,
                      )?.fulfillment
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <CampaignEmpty
            title={
              search || category !== "ALL"
                ? "No matching campaigns"
                : tab === "created"
                  ? "Your first campaign starts here"
                  : tab === "joined"
                    ? "No submissions yet"
                    : "More opportunities are on the way"
            }
            description={
              search || category !== "ALL"
                ? "Try a different search or category."
                : tab === "created"
                  ? "Create a campaign, save your draft, and publish when you’re ready."
                  : tab === "joined"
                    ? "Discover a campaign and submit proof to track your progress here."
                    : "Check back soon, or create a campaign for your community."
            }
            onReset={search || category !== "ALL" ? reset : undefined}
          />
        )}
      </div>
      {system && tab === "discover" && (
        <Link
          href="/referrals"
          className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-4 text-sm hover:bg-secondary/40"
        >
          <div>
            <div className="mb-2">
              <CampaignBadge status="ACTIVE" />
            </div>
            <span className="font-medium">{system.title}</span>
            <p className="mt-1 text-muted-foreground">
              Invite friends and earn referral rewards from your dashboard.
            </p>
          </div>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-primary" />
        </Link>
      )}
    </div>
  );
}
