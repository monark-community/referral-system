'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { WalletConnectStep } from './steps/wallet-connect-step';
import { ProfileStep } from './steps/profile-step';
import { EmailVerifyStep } from './steps/email-verify-step';
import { SuccessStep } from './steps/success-step';
import type { OnboardingStep } from '@/hooks/use-onboarding';

interface OnboardingModalProps {
  isOpen: boolean;
  step: OnboardingStep;
  onClose: () => void;
  onNextStep: () => void;
  onPreviousStep: () => void;
  onGoToStep: (step: OnboardingStep) => void;
  onReturningUser?: () => void;
}

const stepConfig: Record<OnboardingStep, { title: string; description: string }> = {
  wallet: {
    title: 'Connect Wallet',
    description: 'Step 1 of 4',
  },
  profile: {
    title: 'Your Profile',
    description: 'Step 2 of 4',
  },
  'verify-email': {
    title: 'Email Verification',
    description: 'Step 3 of 4',
  },
  success: {
    title: 'All Done!',
    description: 'Step 4 of 4',
  },
};

export function OnboardingModal({
  isOpen,
  step,
  onClose,
  onNextStep,
  onPreviousStep,
  onGoToStep,
  onReturningUser,
}: OnboardingModalProps) {
  const config = stepConfig[step];

  // Determine if close button should be shown
  // Don't show on wallet step to prevent accidental close
  const showCloseButton = step !== 'wallet';

  const handleNeedsVerification = () => {
    // Returning user with unverified email - jump to verify step
    onGoToStep('verify-email');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md"
        onClose={showCloseButton ? onClose : undefined}
        showCloseButton={showCloseButton}
      >
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex gap-1.5 py-2">
          {(['wallet', 'profile', 'verify-email', 'success'] as OnboardingStep[]).map(
            (s, index) => {
              const currentIndex = ['wallet', 'profile', 'verify-email', 'success'].indexOf(step);
              const isCompleted = index < currentIndex;
              const isCurrent = s === step;

              return (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    isCompleted || isCurrent
                      ? 'bg-primary'
                      : 'bg-secondary'
                  }`}
                />
              );
            }
          )}
        </div>

        {/* Step Content */}
        {step === 'wallet' && <WalletConnectStep onSuccess={onNextStep} onReturningUser={onReturningUser} onNeedsVerification={handleNeedsVerification} />}

        {step === 'profile' && (
          <ProfileStep onSuccess={onNextStep} onBack={onPreviousStep} />
        )}

        {step === 'verify-email' && (
          <EmailVerifyStep onSuccess={onNextStep} />
        )}

        {step === 'success' && <SuccessStep onComplete={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
