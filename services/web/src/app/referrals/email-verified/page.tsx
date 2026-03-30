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