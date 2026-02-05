"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OnboardingModal } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useAuth } from "@/contexts/auth-context";

export default function TermsPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const { isAuthenticated } = useAuth();
  const {
    isOpen,
    step,
    openOnboarding,
    closeOnboarding,
    nextStep,
    previousStep,
    goToStep,
  } = useOnboarding();

  const handleContinue = () => {
    if (isAuthenticated) {
      // User already authenticated, go directly to dashboard
      router.push("/referrals");
    } else {
      // Open onboarding modal
      openOnboarding();
    }
  };

  const handleOnboardingClose = () => {
    closeOnboarding();
    // If onboarding was completed (user is now authenticated), redirect
    // This is handled in the success step
  };

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="Terms & Conditions"
        onBack={() => router.push("/referrals/welcome")}
        onClose={() => router.push("/referrals/welcome")}
      />

      <main className="flex-1 min-h-0 p-4">
        <div className="h-full rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <div className="space-y-6 text-sm">
            <div>
              <h2 className="font-semibold text-foreground mb-2">
                LedgerLift Referral Program: Terms and Conditions
              </h2>
              <p className="text-xs text-muted-foreground">
                Last Updated: 2026-01-05
              </p>
            </div>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">1. Overview</h3>
              <p className="text-muted-foreground leading-relaxed">
                The LedgerLift Referral Program (&ldquo;The Program&rdquo;) is designed to reward
                existing Monark users (&ldquo;Referrers&rdquo;) for inviting new users (&ldquo;Referees&rdquo;) to
                join the Monark platform. By participating in The Program, you agree to be
                bound by these Terms and Conditions.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">2. Eligibility</h3>
              <p className="text-muted-foreground leading-relaxed">
                To participate in The Program, you must:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                <li>Be a registered Monark user with an account in good standing.</li>
                <li>Be at least 18 years of age.</li>
                <li>Reside in a jurisdiction where Monark services are legally permitted.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">3. Referral Requirements</h3>
              <p className="text-muted-foreground leading-relaxed">
                A &ldquo;Qualified Referral&rdquo; is defined as a new user who:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1 ml-2">
                <li>Signs up for Monark using your unique LedgerLift Referral Link.</li>
                <li>Completes the identity verification process (KYC).</li>
                <li>
                  Executes a qualifying action (e.g., a minimum deposit of $500 or their
                  first trade) within 30 days of registration.
                </li>
              </ol>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-foreground">4. Rewards Structure</h3>
              <p className="text-muted-foreground leading-relaxed">
                The LedgerLift Referral Program offers tiered incentives designed to
                reward both consistent and high-volume advocates. Rewards are
                cumulative and distributed based on the following milestones:
              </p>
              <p className="text-muted-foreground leading-relaxed mt-2">
                <strong>Standard Referral Bonus:</strong> For every individual Qualified Referral, the
                Referrer will receive a $25 Account Credit deposited directly into their
                primary Monark wallet.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-border space-y-4">
        {/* Checkbox */}
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

        {/* Actions */}
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
            disabled={!accepted}
            onClick={handleContinue}
          >
            Continue
          </Button>
        </div>
      </footer>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOpen}
        step={step}
        onClose={handleOnboardingClose}
        onNextStep={nextStep}
        onPreviousStep={previousStep}
        onGoToStep={goToStep}
      />
    </div>
  );
}
