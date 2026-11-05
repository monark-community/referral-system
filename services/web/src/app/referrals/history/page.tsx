// Purpose: Unified history for invites, referral points, campaign rewards, and native-chain rewards

"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useInvites, useReferralRewardHistory } from "@/lib/api/hooks";
import { useMyCampaigns, useMyDirectRewards } from "@/lib/api/campaign-hooks";
import type { DirectRewardEvent, MyCampaigns } from "@/lib/api/campaigns";
import type { Invite, ReferralReward } from "@/lib/api/user";
import { formatNativeAmount } from "@/lib/native-amount";

enum InviteStatus {
  Pending,
  Accepted,
  Closed,
}

const filterTabs = [
  { id: -1, label: "All" },
  { id: InviteStatus.Pending, label: "Pending" },
  { id: InviteStatus.Accepted, label: "Earned" },
  { id: InviteStatus.Closed, label: "Cancelled" },
] as const;

function getStatusBadge(status: InviteStatus, points?: number) {
  if (status === InviteStatus.Pending) return <Badge variant="secondary" className="text-xs">Pending</Badge>;
  if (status === InviteStatus.Closed) return <Badge variant="destructive" className="text-xs">Cancelled</Badge>;
  return (
    <Badge variant="success" className="text-xs tabular-nums">
      {points ? `${points.toLocaleString().replace(/,/g, "'")} Points Earned` : "Earned"}
    </Badge>
  );
}

function InviteItem({ invite }: { invite: Invite }) {
  const dateLabel = invite.status === InviteStatus.Pending ? "Invited" : invite.status === InviteStatus.Accepted ? "Joined" : "Cancelled";
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-secondary/30">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
        <span className="text-sm font-medium text-muted-foreground">{invite.referee?.name?.charAt(0).toUpperCase() || "?"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{invite.referee?.name || invite.description || "Unknown User"}</span>
          {getStatusBadge(invite.status, invite.points)}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel} {invite.createdAt}</p>
      </div>
    </div>
  );
}

function RewardItem({ reward }: { reward: ReferralReward }) {
  const displayName = reward.participant.name || `${reward.participant.walletAddress.slice(0, 6)}...${reward.participant.walletAddress.slice(-4)}`;
  const relationship = reward.referralLevel === 2 ? "Grandchild" : "Direct referral";
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-secondary/30">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
        <span className="text-sm font-medium text-muted-foreground">{displayName.charAt(0).toUpperCase()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          <Badge variant="success" className="text-xs tabular-nums">{reward.points.toLocaleString().replace(/,/g, "'")} Points Earned</Badge>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">Level {reward.referralLevel}</Badge>
          <span className="text-xs text-muted-foreground">{relationship} · {new Date(reward.observedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function CampaignRewardItem({ item }: { item: MyCampaigns["joined"][number] }) {
  const { campaign, fulfillment } = item;
  const native = campaign.reward.type === "DIRECT";
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-secondary/30">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-semibold text-amber-300">C</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{campaign.title}</span>
          <Badge variant="success" className="text-xs tabular-nums">
            {native ? formatNativeAmount(String(fulfillment.completerReward)) : Number(fulfillment.completerReward).toLocaleString()} {native ? "Native Earned" : "Points Earned"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Campaign reward · {new Date(fulfillment.rewardedAt!).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

function NativeRewardItem({ event }: { event: DirectRewardEvent }) {
  const withdrawn = event.type === "WITHDRAWN";
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-colors duration-150 hover:bg-secondary/30">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sm font-semibold text-sky-300">N</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{withdrawn ? "Native rewards withdrawn" : "Native-chain reward"}</span>
          <Badge variant={withdrawn ? "secondary" : "success"} className="text-xs tabular-nums">
            {formatNativeAmount(event.amountWei)} Native {withdrawn ? "Withdrawn" : "Earned"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Confirmed on chain · {new Date(event.observedAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

interface HistoryRow {
  key: string;
  occurredAt: string;
  node: ReactNode;
}

export default function InvitesHistoryPage() {
  const router = useRouter();
  const { data: invitesData, isLoading } = useInvites();
  const { data: rewardsData, isLoading: rewardsLoading } = useReferralRewardHistory();
  const { data: campaignsData, isLoading: campaignsLoading } = useMyCampaigns();
  const { data: nativeData, isLoading: nativeLoading } = useMyDirectRewards();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<number>(-1);

  const inviteData = invitesData?.invites ?? [];
  const rewardData = rewardsData?.rewardHistory ?? [];
  const joinedCampaigns = campaignsData?.joined ?? [];
  const nativeHistory = nativeData?.history ?? [];
  const loading = (isLoading && !invitesData) || (rewardsLoading && !rewardsData) || (campaignsLoading && !campaignsData) || (nativeLoading && !nativeData);
  const search = searchQuery.trim().toLowerCase();
  const match = (...values: Array<string | null | undefined>) => !search || values.some((value) => value?.toLowerCase().includes(search));

  const filteredInvites = inviteData.filter((invite) => invite.isVerified && match(invite.referee?.name, invite.referee?.walletAddress, invite.description));
  const invitesFor = (status: InviteStatus) => filteredInvites.filter((invite) => invite.status === status && (activeFilter === -1 || activeFilter === status));
  const filteredRewards = rewardData.filter((reward) => (activeFilter === -1 || activeFilter === InviteStatus.Accepted) && match(reward.participant.name, reward.participant.walletAddress));
  const filteredCampaigns = joinedCampaigns.filter(({ campaign, fulfillment }) => fulfillment.status === "REWARDED" && Boolean(fulfillment.rewardedAt) && (activeFilter === -1 || activeFilter === InviteStatus.Accepted) && match(campaign.title, campaign.description));

  const directRewardWallets = new Set(rewardData.filter((reward) => reward.referralLevel === 1).map((reward) => reward.participant.walletAddress.toLowerCase()));
  const legacyEarnedInvites = invitesFor(InviteStatus.Accepted).filter((invite) => !invite.referee?.walletAddress || !directRewardWallets.has(invite.referee.walletAddress.toLowerCase()));
  const directCampaignTransactions = new Set(filteredCampaigns.filter(({ campaign }) => campaign.reward.type === "DIRECT").map(({ fulfillment }) => fulfillment.reward?.transactionHash.toLowerCase()).filter(Boolean));
  const filteredNative = nativeHistory.filter((event) => (activeFilter === -1 || activeFilter === InviteStatus.Accepted) && match(event.transactionHash, event.account, event.destination) && !(event.type === "ACCRUED" && directCampaignTransactions.has(event.transactionHash.toLowerCase())));

  const earnedRows: HistoryRow[] = [
    ...filteredRewards.map((reward) => ({ key: `referral-${reward.id}`, occurredAt: reward.observedAt, node: <RewardItem reward={reward} /> })),
    ...filteredCampaigns.map((item) => ({ key: `campaign-${item.fulfillment.id}`, occurredAt: item.fulfillment.rewardedAt!, node: <CampaignRewardItem item={item} /> })),
    ...filteredNative.filter((event) => event.type === "ACCRUED").map((event) => ({ key: `native-${event.id}`, occurredAt: event.observedAt, node: <NativeRewardItem event={event} /> })),
    ...legacyEarnedInvites.map((invite) => ({ key: `invite-${invite.id}`, occurredAt: invite.updatedAt || invite.createdAt, node: <InviteItem invite={invite} /> })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const withdrawals = filteredNative.filter((event) => event.type === "WITHDRAWN");
  const pending = invitesFor(InviteStatus.Pending);
  const cancelled = invitesFor(InviteStatus.Closed);
  const hasVisibleHistory = loading || pending.length > 0 || earnedRows.length > 0 || withdrawals.length > 0 || cancelled.length > 0;

  return (
    <ResponsiveShell title="History" onBack={() => router.push("/referrals")} onClose={() => router.push("/referrals")} desktopTitle="History" desktopSubtitle="Track invites, campaign rewards, points, and native-chain activity">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search history..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full rounded-xl bg-card/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring surface-card" />
          </div>
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:pb-0">
            {filterTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveFilter(tab.id)} className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", activeFilter === tab.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {pending.length > 0 && <HistorySection title="Pending">{pending.map((invite) => <InviteItem key={invite.id} invite={invite} />)}</HistorySection>}
          {earnedRows.length > 0 && <HistorySection title="Earned">{earnedRows.map((row) => <div key={row.key}>{row.node}</div>)}</HistorySection>}
          {withdrawals.length > 0 && <HistorySection title="Withdrawals">{withdrawals.map((event) => <NativeRewardItem key={event.id} event={event} />)}</HistorySection>}
          {cancelled.length > 0 && <HistorySection title="Cancelled">{cancelled.map((invite) => <InviteItem key={invite.id} invite={invite} />)}</HistorySection>}
          {!hasVisibleHistory && <div className="py-12 text-center"><p className="text-muted-foreground">No history found</p></div>}
        </div>
      </div>
    </ResponsiveShell>
  );
}

function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border/30 rounded-xl bg-card/50 surface-card">{children}</div>
    </section>
  );
}
