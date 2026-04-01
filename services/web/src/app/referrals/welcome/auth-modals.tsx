"use client";

import dynamic from "next/dynamic";

const WagmiWrap = dynamic(
  () => import("@/providers/wagmi-provider").then((m) => m.WagmiProviderWrapper),
  { ssr: false }
);
const LoginModal = dynamic(
  () => import("@/components/login/login-modal").then((m) => m.LoginModal),
  { ssr: false }
);
const OnboardingModal = dynamic(
  () => import("@/components/onboarding").then((m) => m.OnboardingModal),
  { ssr: false }
);

interface AuthModalsProps {
  isLoginOpen: boolean;
  onLoginClose: () => void;
  isOnboardingOpen: boolean;
  step: string;
  onOnboardingClose: () => void;
  onNextStep: () => void;
  onPreviousStep: () => void;
  onGoToStep: (step: any) => void;
  onReturningUser: () => void;
}

export default function AuthModals({
  isLoginOpen,
  onLoginClose,
  isOnboardingOpen,
  step,
  onOnboardingClose,
  onNextStep,
  onPreviousStep,
  onGoToStep,
  onReturningUser,
}: AuthModalsProps) {
  return (
    <WagmiWrap>
      {isLoginOpen && (
        <LoginModal isOpen={isLoginOpen} onClose={onLoginClose} />
      )}
      {isOnboardingOpen && (
        <OnboardingModal
          isOpen={isOnboardingOpen}
          step={step as any}
          onClose={onOnboardingClose}
          onNextStep={onNextStep}
          onPreviousStep={onPreviousStep}
          onGoToStep={onGoToStep}
          onReturningUser={onReturningUser}
        />
      )}
    </WagmiWrap>
  );
}
