"use client";

import { ReactNode } from "react";
import { PageHeader } from "@/components/referral";
import { SidebarNav } from "./sidebar-nav";

interface ResponsiveShellProps {
  children: ReactNode;
  /** Page title shown in the mobile header */
  title: string;
  /** Subtitle shown above the title in mobile header */
  subtitle?: string;
  /** Mobile back button handler */
  onBack?: () => void;
  /** Mobile close button handler */
  onClose?: () => void;
  /** Footer content (shown below main on mobile, below content on desktop) */
  footer?: ReactNode;
  /** Whether to show the sidebar (set false for unauthenticated pages) */
  showSidebar?: boolean;
}

export function ResponsiveShell({
  children,
  title,
  subtitle = "Referrals Program",
  onBack,
  onClose,
  footer,
  showSidebar = true,
}: ResponsiveShellProps) {
  if (!showSidebar) {
    // Unauthenticated layout: centered column on both mobile and desktop
    return (
      <div className="h-screen bg-background flex flex-col max-w-md lg:max-w-2xl mx-auto overflow-hidden">
        {/* Mobile header */}
        <PageHeader
          subtitle={subtitle}
          title={title}
          onBack={onBack}
          onClose={onClose}
        />
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
        {footer}
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop sidebar */}
      <SidebarNav />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header — hidden on desktop since sidebar has the nav */}
        <div className="lg:hidden">
          <PageHeader
            subtitle={subtitle}
            title={title}
            onBack={onBack}
            onClose={onClose}
          />
        </div>

        {/* Desktop header — simple title bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-border">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 lg:p-8 lg:max-w-3xl">
            {children}
          </div>
        </main>

        {/* Footer */}
        {footer}
      </div>
    </div>
  );
}
