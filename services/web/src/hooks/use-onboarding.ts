'use client';

import { useState, useCallback } from 'react';

export type OnboardingStep = 'wallet' | 'profile' | 'verify-email' | 'success';

interface UseOnboardingReturn {
  step: OnboardingStep;
  isOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: OnboardingStep) => void;
  reset: () => void;
}

const STEPS: OnboardingStep[] = ['wallet', 'profile', 'verify-email', 'success'];

export function useOnboarding(): UseOnboardingReturn {
  const [step, setStep] = useState<OnboardingStep>('wallet');
  const [isOpen, setIsOpen] = useState(false);

  const openOnboarding = useCallback(() => {
    setStep('wallet');
    setIsOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOpen(false);
  }, []);

  const nextStep = useCallback(() => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  }, [step]);

  const previousStep = useCallback(() => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  }, [step]);

  const goToStep = useCallback((newStep: OnboardingStep) => {
    setStep(newStep);
  }, []);

  const reset = useCallback(() => {
    setStep('wallet');
    setIsOpen(false);
  }, []);

  return {
    step,
    isOpen,
    openOnboarding,
    closeOnboarding,
    nextStep,
    previousStep,
    goToStep,
    reset,
  };
}
