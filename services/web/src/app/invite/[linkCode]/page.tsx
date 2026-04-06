// Purpose: Invite landing page - captures referral/invite codes from the URL and redirects to welcome
// Notes:
// - Stores referralCode and optional inviteCode in localStorage so they persist through onboarding
// - The codes are consumed later during wallet authentication in the onboarding flow

'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { parseLinkCode } from '@/lib/utils';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const linkCode = params.linkCode as string;

  const {referralCode, inviteCode} = parseLinkCode(linkCode);

  useEffect(() => {
    if (referralCode) {
      localStorage.setItem('referralCode', referralCode);
      if (inviteCode){
        localStorage.setItem('inviteCode', inviteCode);
      }
    }
    router.replace('/referrals/welcome');
  }, [referralCode, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
