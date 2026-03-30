"use client";

import { ReactNode } from "react";
import { PageHeader } from "@/components/referral";
import { SidebarNav } from "./sidebar-nav";

interface ResponsiveShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  footer?: ReactNode;
  showSidebar?: boolean;
  desktopTitle?: string;
  desktopSubtitle?: string;
}

export function ResponsiveShell({
  children,
  title,
  subtitle = "Referrals Program",
  onBack,
  onClose,
  footer,
  showSidebar = true,
  desktopTitle,
  desktopSubtitle,
}: ResponsiveShellProps) {
  if (!showSidebar) {
    return (
      <div className="h-screen bg-background flex flex-col max-w-md lg:max-w-2xl mx-auto overflow-hidden">
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
      <SidebarNav />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="lg:hidden">
          <PageHeader
            subtitle={subtitle}
            title={title}
            onBack={onBack}
            onClose={onClose}
          />
        </div>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 lg:px-8 lg:py-6">
            {(desktopTitle || title) && (
              <div className="hidden lg:block mb-6">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight" style={{ textWrap: "balance" }}>
                  {desktopTitle || title}
                </h1>
                {desktopSubtitle && (
                  <p className="text-[14px] text-muted-foreground mt-1" style={{ textWrap: "pretty" }}>
                    {desktopSubtitle}
                  </p>
                )}
              </div>
            )}
            {children}
          </div>
        </main>

        {footer}
      </div>
    </div>
  );
}
