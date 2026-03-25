"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  User,
  HelpCircle,
  History,
  Settings,
  Gift,
  FileText,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const navItems = [
  { label: "Referral Program", href: "/referrals", icon: Home },
  { label: "My Profile", href: "/referrals/profile", icon: User },
  { label: "How it Works", href: "/referrals/how-it-works", icon: HelpCircle },
  { label: "Invites History", href: "/referrals/history", icon: History },
  { label: "Preferences", href: "/referrals/preferences", icon: Settings },
  { label: "Rewards", href: "/referrals/rewards", icon: Gift },
  { label: "Terms & Conditions", href: "/referrals/terms", icon: FileText },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/referrals/welcome");
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-border bg-card h-screen sticky top-0">
      {/* Brand */}
      <div className="p-5 border-b border-border">
        <p className="text-xs text-muted-foreground">LedgerLift</p>
        <h1 className="text-lg font-semibold text-foreground">Referrals Program</h1>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      {user && (
        <div className="p-3 border-t border-border space-y-2">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name || "Unnamed User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
