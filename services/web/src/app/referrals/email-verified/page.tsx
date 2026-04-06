// Purpose: Email verification result page - wraps EmailVerifiedContent in a Suspense boundary
// Notes:
// - The API redirects here after the user clicks the email verification link
// - Uses Suspense because useSearchParams() requires it in Next.js App Router

import { Suspense } from 'react';
import EmailVerifiedContent from './EmailVerifiedContent';

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verifying...</p>
      </div>
    }>
      <EmailVerifiedContent />
    </Suspense>
  );
}
