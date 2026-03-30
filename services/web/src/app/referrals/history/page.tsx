"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ResponsiveShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useInvites } from "@/lib/api/hooks";
import type { Invite } from "@/lib/api/user";

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
      return (
        <Badge variant="secondary" className="text-xs">
          {statusDetail || "Pending"}
        </Badge>
      );
    case InviteStatus.Accepted:
      return (
        <Badge variant="success" className="text-xs">
          {points ? `${points.toLocaleString().replace(/,/g, "'")} Points Earned` : "Earned"}
        </Badge>
      );
    case InviteStatus.Closed:
      return (
        <Badge variant="destructive" className="text-xs">
          Cancelled
        </Badge>
      );
    default:
      return null;
  }
}

function InviteItem({ invite }: { invite: Invite }) {
  const getDateLabel = (status: InviteStatus) => {
    switch (status) {
      case InviteStatus.Pending:
        return "Invited";
      case InviteStatus.Accepted:
        return "Joined";
      case InviteStatus.Closed:
        return "Cancelled";
      default:
        return "";
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-muted-foreground">
          {invite.referee?.name?.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {invite.referee?.name || "Unknown User"}
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

export default function InvitesHistoryPage() {
  const router = useRouter();
  const { data: invitesData, isLoading } = useInvites();
  const inviteData = invitesData?.invites ?? null;
  const loading = isLoading && !invitesData;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<number>(-1);

  const filteredInvites = inviteData?.filter((invite) => {
    const matchesSearch = invite.referee?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === -1|| invite.status === activeFilter;
    return matchesSearch && matchesFilter;
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

  return (
    <ResponsiveShell
      title="Invites History"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
    >
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  activeFilter === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Invites List */}
          <div className="space-y-4">

            {groupedInvites?.[InviteStatus.Pending] && groupedInvites[InviteStatus.Pending].length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Pending
                </h3>
                <div className="space-y-1">
                  {groupedInvites[InviteStatus.Pending].map((invite) => (
                    <InviteItem key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            )}

            {groupedInvites?.[InviteStatus.Accepted] && groupedInvites[InviteStatus.Accepted].length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Earned
                </h3>
                <div className="space-y-1">
                  {groupedInvites[InviteStatus.Accepted].map((invite) => (
                    <InviteItem key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            )}

            {filteredInvites?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No invites found</p>
              </div>
            )}
          </div>
        </div>
    </ResponsiveShell>
  );
}
