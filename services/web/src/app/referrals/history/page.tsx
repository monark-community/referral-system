// Purpose: Referral history page - lists invite states and direct/grandchild rewards
// Notes:
// - Invites are grouped by status (Pending, Earned, Cancelled) and filterable via tabs
// - Only verified invites are shown to the user

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useInvites, useReferralRewardHistory } from "@/lib/api/hooks";
import type { Invite, ReferralReward } from "@/lib/api/user";

enum InviteStatus {
    Pending,
    Accepted,
    Closed
}

const filterTabs = [
  { id: -1, label: "All" },
  { id: InviteStatus.Pending, label: "Pending" },
  { id: InviteStatus.Accepted, label: "Earned" },
  { id: InviteStatus.Closed, label: "Cancelled" },
] as const;

function getStatusBadge(status: InviteStatus, points?: number, statusDetail?: string) {
  switch (status) {
    case InviteStatus.Pending:
      return <Badge variant="secondary" className="text-xs">{statusDetail || "Pending"}</Badge>;
    case InviteStatus.Accepted:
      return <Badge variant="success" className="text-xs tabular-nums">{points ? `${points.toLocaleString().replace(/,/g, "'")} Points Earned` : "Earned"}</Badge>;
    case InviteStatus.Closed:
      return <Badge variant="destructive" className="text-xs">Cancelled</Badge>;
    default:
      return null;
  }
}

function InviteItem({ invite }: { invite: Invite }) {
  const getDateLabel = (status: InviteStatus) => {
    switch (status) {
      case InviteStatus.Pending: return "Invited";
      case InviteStatus.Accepted: return "Joined";
      case InviteStatus.Closed: return "Cancelled";
      default: return "";
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors duration-150">
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-muted-foreground">
          {invite.referee?.name?.charAt(0).toUpperCase() || "?"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {invite.referee
              ? invite.referee.name
              : invite.description
              ? invite.description
              : "Unknown User"}
          </span>
          {getStatusBadge(invite.status, invite.points)}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getDateLabel(invite.status)} {invite.createdAt}
        </p>
      </div>
    </div>
  );
}

function RewardItem({ reward }: { reward: ReferralReward }) {
  const displayName =
    reward.participant.name ||
    `${reward.participant.walletAddress.slice(0, 6)}...${reward.participant.walletAddress.slice(-4)}`;
  const relationship = reward.referralLevel === 2 ? "Grandchild" : "Direct referral";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors duration-150">
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-muted-foreground">
          {displayName.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {displayName}
          </span>
          <Badge variant="success" className="text-xs tabular-nums">
            {reward.points.toLocaleString().replace(/,/g, "'")} Points Earned
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-[10px]">
            Level {reward.referralLevel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {relationship} · {new Date(reward.observedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function InvitesHistoryPage() {
  const router = useRouter();
  const { data: invitesData, isLoading } = useInvites();
  const { data: rewardsData, isLoading: rewardsLoading } =
    useReferralRewardHistory();
  const inviteData = invitesData?.invites ?? null;
  const rewardData = rewardsData?.rewardHistory ?? [];
  const loading =
    (isLoading && !invitesData) || (rewardsLoading && !rewardsData);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<number>(-1);

  const filteredInvites = inviteData?.filter((invite) => {
    const verified = invite.isVerified;
    const matchesSearch = searchQuery === "" ? true : invite.referee?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === -1 || invite.status === activeFilter;
    return matchesSearch && matchesFilter && verified;
  });

  const groupedInvites = filteredInvites?.reduce(
    (acc, invite) => {
      const group = invite.status;
      if (!acc[group]) acc[group] = [];
      acc[group].push(invite);
      return acc;
    },
    {} as Record<number, Invite[]>
  );

  const filteredRewards = rewardData.filter((reward) => {
    const searchValue = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      reward.participant.name?.toLowerCase().includes(searchValue) ||
      reward.participant.walletAddress.toLowerCase().includes(searchValue);
    const matchesFilter =
      activeFilter === -1 || activeFilter === InviteStatus.Accepted;
    return matchesSearch && matchesFilter;
  });

  const directRewardWallets = new Set(
    rewardData
      .filter((reward) => reward.referralLevel === 1)
      .map((reward) => reward.participant.walletAddress.toLowerCase()),
  );
  const legacyEarnedInvites =
    groupedInvites?.[InviteStatus.Accepted]?.filter(
      (invite) =>
        !invite.referee?.walletAddress ||
        !directRewardWallets.has(invite.referee.walletAddress.toLowerCase()),
    ) ?? [];
  const hasEarnedHistory =
    filteredRewards.length > 0 || legacyEarnedInvites.length > 0;
  const hasVisibleHistory =
    loading ||
    hasEarnedHistory ||
    Object.values(groupedInvites ?? {}).some((invites) => invites.length > 0);

  return (
    <ResponsiveShell
      title="Invites History"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
      desktopTitle="History"
      desktopSubtitle="Track all your referral invites and their status"
    >
      <div className="space-y-4">
        {/* Search + Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative lg:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invites..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-card/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring surface-card transition-shadow duration-150 focus:surface-card-hover"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-hide shrink-0">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                  activeFilter === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Invites List */}
        <div className="space-y-5">
          {groupedInvites?.[InviteStatus.Pending] && groupedInvites[InviteStatus.Pending].length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Pending</h3>
              <div className="rounded-xl bg-card/50 surface-card divide-y divide-border/30">
                {groupedInvites[InviteStatus.Pending].map((invite) => (
                  <InviteItem key={invite.id} invite={invite} />
                ))}
              </div>
            </section>
          )}

          {hasEarnedHistory && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Earned</h3>
              <div className="rounded-xl bg-card/50 surface-card divide-y divide-border/30">
                {filteredRewards.map((reward) => (
                  <RewardItem key={`${reward.transactionHash}-${reward.logIndex}`} reward={reward} />
                ))}
                {legacyEarnedInvites.map((invite) => (
                  <InviteItem key={invite.id} invite={invite} />
                ))}
              </div>
            </section>
          )}

          {!hasVisibleHistory && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No invites found</p>
            </div>
          )}
        </div>
      </div>
    </ResponsiveShell>
  );
}
