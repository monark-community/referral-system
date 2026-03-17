'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { acceptTerms } from '@/lib/api/user';
import { useAuth } from '@/contexts/auth-context';

interface TermsStepProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function TermsStep({ onSuccess, onBack }: TermsStepProps) {
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateUser } = useAuth();

  const handleContinue = async () => {
    if (!accepted) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await acceptTerms();
      updateUser(response.user);
      onSuccess();
    } catch (err) {
      console.error('Accept terms error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to accept terms. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-4">
      {/* Icon */}
      <div className="mb-4 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ScrollText className="h-8 w-8 text-primary" />
        </div>
      </div>

      {/* Title */}
      <h3 className="mb-2 text-center text-lg font-semibold text-foreground">
        Terms & Conditions
      </h3>

      <p className="mb-4 text-center text-sm text-muted-foreground">
        Please review and accept the terms to continue.
      </p>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Terms Content */}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card p-3 mb-4">
        <div className="space-y-4 text-xs">
          <div>
            <h4 className="font-semibold text-foreground mb-1">
              LedgerLift Referral Program: Terms and Conditions
            </h4>
            <p className="text-[10px] text-muted-foreground">Last Updated: 2026-01-05</p>
          </div>

          <section className="space-y-1">
            <h5 className="font-semibold text-foreground">1. Overview</h5>
            <p className="text-muted-foreground leading-relaxed">
              The LedgerLift Referral Program (&ldquo;The Program&rdquo;) is designed to reward
              existing Monark users (&ldquo;Referrers&rdquo;) for inviting new users (&ldquo;Referees&rdquo;) to
              join the Monark platform. By participating in The Program, you agree to be
              bound by these Terms and Conditions.
            </p>
          </section>

          <section className="space-y-1">
            <h5 className="font-semibold text-foreground">2. Eligibility</h5>
            <p className="text-muted-foreground leading-relaxed">
              To participate in The Program, you must:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5 ml-2">
              <li>Be a registered Monark user with an account in good standing.</li>
              <li>Be at least 18 years of age.</li>
              <li>Reside in a jurisdiction where Monark services are legally permitted.</li>
            </ul>
          </section>

          <section className="space-y-1">
            <h5 className="font-semibold text-foreground">3. Referral Requirements</h5>
            <p className="text-muted-foreground leading-relaxed">
              A &ldquo;Qualified Referral&rdquo; is defined as a new user who:
            </p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 ml-2">
              <li>Signs up for Monark using your unique LedgerLift Referral Link.</li>
              <li>Completes the identity verification process (KYC).</li>
              <li>
                Executes a qualifying action (e.g., a minimum deposit of $500 or their
                first trade) within 30 days of registration.
              </li>
            </ol>
          </section>

          <section className="space-y-1">
            <h5 className="font-semibold text-foreground">4. Rewards Structure</h5>
            <p className="text-muted-foreground leading-relaxed">
              The LedgerLift Referral Program offers tiered incentives designed to
              reward both consistent and high-volume advocates. Rewards are
              cumulative and distributed based on the following milestones:
            </p>
            <p className="text-muted-foreground leading-relaxed mt-1">
              <strong>Standard Referral Bonus:</strong> For every individual Qualified Referral, the
              Referrer will receive a $25 Account Credit deposited directly into their
              primary Monark wallet.
            </p>
          </section>
        </div>
      </div>

      {/* Checkbox */}
      <label className="flex items-center gap-3 cursor-pointer mb-4">
        <button
          role="checkbox"
          aria-checked={accepted}
          onClick={() => setAccepted(!accepted)}
          disabled={isSubmitting}
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
            accepted
              ? 'bg-primary border-primary'
              : 'border-muted-foreground hover:border-foreground'
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
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!accepted || isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Accepting...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}
