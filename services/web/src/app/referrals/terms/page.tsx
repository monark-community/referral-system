"use client";

import { useState, useEffect, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { TermsContent, TermsModal } from "@/components/referral/terms-modal";

export default function TermsPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [OnboardingFlow, setOnboardingFlow] = useState<ComponentType<{
    onClose: () => void;
    onReturningUser: () => void;
  }> | null>(null);

  useEffect(() => setMounted(true), []);

  const handleContinue = () => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.push("/referrals");
    } else {
      import("./onboarding-flow").then((m) => setOnboardingFlow(() => m.default));
    }
  };

  // Authenticated: show modal over previous page
  if (mounted && !isLoading && isAuthenticated) {
    return <TermsModal onClose={() => router.back()} />;
  }

  // Unauthenticated: show full page with accept + continue flow
  const footerContent = (
    <footer className="p-4 border-t border-border lg:border-t-0 lg:pt-0 lg:px-0 space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <button
          role="checkbox"
          aria-checked={accepted}
          onClick={() => setAccepted(!accepted)}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            accepted
              ? "bg-primary border-primary"
              : "border-muted-foreground hover:border-foreground"
          )}
        >
          {accepted && (
            <svg
              className="w-3 h-3 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </button>
        <span className="text-sm text-muted-foreground">
          I have read and accept the terms and conditions.
        </span>
      </label>

      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => router.push("/referrals/welcome")}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!accepted || isLoading}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </footer>
  );

  return (
    <ResponsiveShell
      title="Terms & Conditions"
      onBack={() => router.push("/referrals/welcome")}
      onClose={() => router.push("/referrals/welcome")}
      showSidebar={false}
      footer={footerContent}
    >
      <div className="p-4">
        <div className="rounded-lg border border-border bg-card p-4 overflow-y-auto max-h-[60vh] lg:max-h-none">
          <TermsContent />
        </div>
      </div>

      {OnboardingFlow && (
        <OnboardingFlow
          onClose={() => setOnboardingFlow(null)}
          onReturningUser={() => {
            setOnboardingFlow(null);
            router.push("/referrals");
          }}
        />
      )}
    </ResponsiveShell>
  );
}
