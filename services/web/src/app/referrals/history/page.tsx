"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/referral";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InviteStatus = "action_required" | "pending" | "earned" | "cancelled";

interface Invite {
  id: string;
  username: string;
  status: InviteStatus;
  date: string;
  points?: number;
  statusDetail?: string;
}

const mockInvites: Invite[] = [
  {
    id: "1",
    username: "zk8a01__aaa00a0",
    status: "action_required",
    date: "January 2nd 2026",
    statusDetail: "Pending Network Approval",
  },
  {
    id: "2",
    username: "Vincent Grenier",
    status: "pending",
    date: "December 31st 2025",
    statusDetail: "Pending Response",
  },
  {
    id: "3",
    username: "Loucas Pelletier",
    status: "earned",
    date: "December 14th 2025",
    points: 5000,
  },
  {
    id: "4",
    username: "Adam Anderson",
    status: "earned",
    date: "December 13th 2025",
    points: 5000,
  },
  {
    id: "5",
    username: "Bernard Branson",
    status: "earned",
    date: "December 12th 2025",
    points: 5000,
  },
];

const filterTabs = [
  { id: "all", label: "All" },
  { id: "action_required", label: "Action Required" },
  { id: "pending", label: "Pending" },
  { id: "earned", label: "Earned" },
  { id: "cancelled", label: "Cancelled" },
] as const;

function getStatusBadge(status: InviteStatus, points?: number, statusDetail?: string) {
  switch (status) {
    case "action_required":
      return (
        <Badge variant="warning" className="text-xs">
          {statusDetail || "Action Required"}
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="text-xs">
          {statusDetail || "Pending"}
        </Badge>
      );
    case "earned":
      return (
        <Badge variant="success" className="text-xs">
          {points ? `${points.toLocaleString().replace(/,/g, "'")} Points Earned` : "Earned"}
        </Badge>
      );
    case "cancelled":
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
      case "action_required":
        return "Referral code used on";
      case "pending":
        return "Invited";
      case "earned":
        return "Joined";
      case "cancelled":
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
          {invite.username.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {invite.username}
          </span>
          {getStatusBadge(invite.status, invite.points, invite.statusDetail)}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getDateLabel(invite.status)} {invite.date}
        </p>
      </div>
    </div>
  );
}

export default function InvitesHistoryPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const filteredInvites = mockInvites.filter((invite) => {
    const matchesSearch = invite.username
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === "all" || invite.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const groupedInvites = filteredInvites.reduce(
    (acc, invite) => {
      const group = invite.status === "action_required" ? "action_required" : invite.status;
      if (!acc[group]) acc[group] = [];
      acc[group].push(invite);
      return acc;
    },
    {} as Record<string, Invite[]>
  );

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="Invites History"
        onBack={() => router.push("/referrals")}
        onClose={() => router.push("/referrals")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
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
            {groupedInvites.action_required && groupedInvites.action_required.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Action Required
                </h3>
                <div className="space-y-1">
                  {groupedInvites.action_required.map((invite) => (
                    <InviteItem key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            )}

            {groupedInvites.pending && groupedInvites.pending.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Pending
                </h3>
                <div className="space-y-1">
                  {groupedInvites.pending.map((invite) => (
                    <InviteItem key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            )}

            {groupedInvites.earned && groupedInvites.earned.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Earned
                </h3>
                <div className="space-y-1">
                  {groupedInvites.earned.map((invite) => (
                    <InviteItem key={invite.id} invite={invite} />
                  ))}
                </div>
              </section>
            )}

            {filteredInvites.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No invites found</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
