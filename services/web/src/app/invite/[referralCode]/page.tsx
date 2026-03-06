'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const referralCode = params.referralCode as string;

  useEffect(() => {
    if (referralCode) {
      localStorage.setItem('referralCode', referralCode);
    }
    router.replace('/referrals/terms');
  }, [referralCode, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
