'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, CheckCircle2 } from 'lucide-react';
import { sendVerificationEmail } from '@/lib/api/user';
import { useAuth } from '@/contexts/auth-context';

interface EmailVerifyStepProps {
  onSuccess: () => void;
}

const RESEND_COOLDOWN = 60; // seconds

export function EmailVerifyStep({ onSuccess }: EmailVerifyStepProps) {
  const { user, refreshUser } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  // Poll for email verification status
  useEffect(() => {
    if (!isPolling) return;

    const pollInterval = setInterval(async () => {
      try {
        await refreshUser();
      } catch {
        // Ignore errors during polling
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [isPolling, refreshUser]);

  // Check if email is verified
  useEffect(() => {
    if (user?.emailVerified) {
      setIsPolling(false);
      // Small delay for UX
      setTimeout(onSuccess, 500);
    }
  }, [user?.emailVerified, onSuccess]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    setIsResending(true);
    setError(null);

    try {
      await sendVerificationEmail();
      setResendCooldown(RESEND_COOLDOWN);
    } catch (err) {
      console.error('Failed to resend email:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send verification email. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  };

  // If email is already verified, show success
  if (user?.emailVerified) {
    return (
      <div className="flex flex-col items-center py-8">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Email Verified!</h3>
        <p className="mt-2 text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-4">
      {/* Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Mail className="h-10 w-10 text-primary" />
      </div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Verify Your Email
      </h3>

      {/* Description */}
      <p className="mb-2 text-center text-sm text-muted-foreground">
        We&apos;ve sent a verification link to:
      </p>
      <p className="mb-6 text-center font-medium text-foreground">
        {user?.email}
      </p>

      {/* Instructions */}
      <div className="mb-6 w-full rounded-lg border border-border bg-secondary/30 p-4">
        <p className="text-center text-sm text-muted-foreground">
          Click the link in your email to verify your account. Check your spam
          folder if you don&apos;t see it.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4 w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Polling indicator */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Waiting for verification...</span>
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col gap-3">
        <Button
          variant="secondary"
          onClick={handleResend}
          disabled={isResending || resendCooldown > 0}
          className="w-full"
        >
          {isResending ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Sending...
            </>
          ) : resendCooldown > 0 ? (
            `Resend in ${resendCooldown}s`
          ) : (
            'Resend Email'
          )}
        </Button>

      </div>
    </div>
  );
}
