'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface SuccessStepProps {
  onComplete: () => void;
}

export function SuccessStep({ onComplete }: SuccessStepProps) {
  const router = useRouter();
  const { user } = useAuth();

  const handleGoToDashboard = () => {
    onComplete();
    router.push('/referrals');
  };

  return (
    <div className="flex flex-col items-center py-4">
      {/* Success Icon */}
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <div className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>

      {/* Title */}
      <h3 className="mb-2 text-xl font-semibold text-foreground">
        Welcome to Reffinity!
      </h3>

      {/* Description */}
      <p className="mb-6 text-center text-sm text-muted-foreground">
        {user?.name ? `Hi ${user.name}, your` : 'Your'} account has been created
        successfully. You&apos;re ready to start referring friends and earning
        rewards!
      </p>

      {/* Referral Code */}
      {user?.referralCode && (
        <div className="mb-6 w-full rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="mb-1 text-center text-xs text-muted-foreground">
            Your Referral Code
          </p>
          <p className="text-center font-mono text-lg font-bold text-primary">
            {user.referralCode}
          </p>
        </div>
      )}

      {/* Quick Tips */}
      <div className="mb-6 w-full space-y-2">
        <p className="text-xs font-medium text-muted-foreground">What&apos;s next:</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">1.</span>
            <span>Share your referral link with friends</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">2.</span>
            <span>Earn points when they sign up</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">3.</span>
            <span>Unlock rewards as you grow your network</span>
          </li>
        </ul>
      </div>

      {/* Action */}
      <Button onClick={handleGoToDashboard} className="w-full">
        Go to Dashboard
      </Button>
    </div>
  );
}
