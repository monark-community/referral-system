"use client";

import { useState } from "react";
import Link from "next/link";
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
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { TermsModal } from "@/components/referral/terms-modal";

const navItems = [
  { label: "Home", href: "/referrals", icon: Home },
  { label: "Profile", href: "/referrals/profile", icon: User },
  { label: "How it Works", href: "/referrals/how-it-works", icon: HelpCircle },
  { label: "History", href: "/referrals/history", icon: History },
  { label: "Rewards", href: "/referrals/rewards", icon: Gift },
];

const secondaryLinks = [
  { label: "Preferences", href: "/referrals/preferences", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showTerms, setShowTerms] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/referrals/welcome");
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 bg-background h-screen sticky top-0" style={{ boxShadow: "1px 0 0 0 hsl(0 0% 100% / 0.06)" }}>
      {/* Brand */}
      <div className="px-6 pt-7 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">R</span>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-foreground leading-tight">
              Reffinity
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Referral Program
            </p>
          </div>
        </div>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </Link>
          );
        })}

        {/* Divider */}
        <div className="!my-3 border-t border-border/50" />

        {secondaryLinks.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setShowTerms(true)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
        >
          <FileText className="w-[18px] h-[18px] shrink-0" />
          <span className="flex-1 text-left">Terms</span>
        </button>
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 py-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-foreground">
                {(user.name || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">
                {user.name || "Unnamed User"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-[background-color,color,transform] duration-150 active:scale-[0.97] mt-1"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            Sign Out
          </button>
        </div>
      )}

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </aside>
  );
}
