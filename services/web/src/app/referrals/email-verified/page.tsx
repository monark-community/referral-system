'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

type VerificationStatus = 'success' | 'error' | 'invalid' | 'loading';

export default function EmailVerifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('loading');

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setStatus('success');
    } else if (error === 'invalid') {
      setStatus('invalid');
    } else if (error) {
      setStatus('error');
    } else {
      setStatus('error');
    }
  }, [searchParams]);

  const statusConfig = {
    success: {
      icon: CheckCircle2,
      iconClass: 'text-success',
      bgClass: 'bg-success/10',
      title: 'Email Verified!',
      description: 'Your email has been successfully verified. You can now access all features of Reffinity.',
    },
    invalid: {
      icon: AlertCircle,
      iconClass: 'text-primary',
      bgClass: 'bg-primary/10',
      title: 'Invalid or Expired Link',
      description: 'This verification link is invalid or has expired. Please request a new verification email from your profile settings.',
    },
    error: {
      icon: XCircle,
      iconClass: 'text-destructive',
      bgClass: 'bg-destructive/10',
      title: 'Verification Failed',
      description: 'Something went wrong while verifying your email. Please try again or contact support.',
    },
    loading: {
      icon: AlertCircle,
      iconClass: 'text-muted-foreground',
      bgClass: 'bg-secondary',
      title: 'Verifying...',
      description: 'Please wait while we verify your email.',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${config.bgClass}`}>
          <Icon className={`h-10 w-10 ${config.iconClass}`} />
        </div>

        {/* Title */}
        <h1 className="mb-3 text-2xl font-semibold text-foreground">
          {config.title}
        </h1>

        {/* Description */}
        <p className="mb-8 text-muted-foreground">
          {config.description}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={() => router.push('/referrals')}
            className="w-full"
          >
            Go to Dashboard
          </Button>

          {status !== 'success' && (
            <Button
              variant="secondary"
              onClick={() => router.push('/referrals/preferences')}
              className="w-full"
            >
              Go to Settings
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
