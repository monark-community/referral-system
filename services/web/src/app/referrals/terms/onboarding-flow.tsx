"use client";

import dynamic from "next/dynamic";
import { useOnboarding } from "@/hooks/use-onboarding";

const WagmiWrap = dynamic(
  () => import("@/providers/wagmi-provider").then((m) => m.WagmiProviderWrapper),
  { ssr: false }
);
const OnboardingModal = dynamic(
  () => import("@/components/onboarding").then((m) => m.OnboardingModal),
  { ssr: false }
);

interface OnboardingFlowProps {
  onClose: () => void;
  onReturningUser: () => void;
}

export default function OnboardingFlow({ onClose, onReturningUser }: OnboardingFlowProps) {
  const {
    isOpen,
    step,
    openOnboarding,
    closeOnboarding,
    nextStep,
    previousStep,
    goToStep,
  } = useOnboarding();

  // Auto-open on mount
  if (!isOpen) {
    openOnboarding();
  }

  return (
    <WagmiWrap>
      <OnboardingModal
        isOpen={isOpen || true}
        step={step}
        onClose={() => {
          closeOnboarding();
          onClose();
        }}
        onNextStep={nextStep}
        onPreviousStep={previousStep}
        onGoToStep={goToStep}
        onReturningUser={onReturningUser}
      />
    </WagmiWrap>
  );
}
