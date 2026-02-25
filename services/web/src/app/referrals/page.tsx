"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  PageHeader,
  PointsCard,
  ReferralLinkCard,
  NavMenuItem,
} from "@/components/referral";
import { OnboardingModal } from "@/components/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";
import { deleteAccount } from "@/lib/api/user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Mock data - replace with actual API calls
const mockUserData = {
  earnedPoints: 15000,
  pendingPoints: 10000,
  referralCode: "K0FBE6BARG",
  pendingInvites: 3,
};

export default function ReferralsPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [userData] = useState(mockUserData);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    isOpen,
    step,
    openOnboarding,
    closeOnboarding,
    nextStep,
    previousStep,
    goToStep,
  } = useOnboarding();

  const needsVerification = user && !user.emailVerified;

  // Auto-open verification modal if email not verified
  useEffect(() => {
    if (!isLoading && needsVerification) {
      goToStep("verify-email");
      openOnboarding();
    }
  }, [isLoading, needsVerification, goToStep, openOnboarding]);

  const handleLogout = () => {
    logout();
    router.push("/referrals/welcome");
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      logout();
      router.push("/referrals/welcome");
    } catch (err) {
      console.error("Failed to delete account:", err);
      setIsDeleting(false);
    }
  };

  const handleVerificationClose = () => {
    // Don't allow closing if email not verified
    if (needsVerification) return;
    closeOnboarding();
  };

  const handleVerificationSuccess = () => {
    closeOnboarding();
  };

  const referralLink = `https://monark.io/invite/${userData.referralCode}`;

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <PageHeader
        subtitle="LedgerLift"
        title="Referrals Program"
        onBack={() => router.push("/referrals/welcome")}
        onClose={() => router.push("/")}
      />

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Points Section */}
          <section className="space-y-3">
            <div className="flex gap-3">
              <PointsCard
                label="Earned"
                points={userData.earnedPoints}
                variant="earned"
              />
              <PointsCard
                label="Pending"
                points={userData.pendingPoints}
                variant="pending"
              />
            </div>
          </section>

          {/* Referral Link Section */}
          <section>
            <ReferralLinkCard referralLink={referralLink} />
          </section>

          {/* Navigation Menu */}
          <section className="space-y-1 pt-2">
            <NavMenuItem
              label="Referral Program"
              onClick={() => router.push("/referrals")}
              isActive
            />
            <NavMenuItem
              label="How it Works"
              onClick={() => router.push("/referrals/how-it-works")}
            />
            <NavMenuItem
              label="Invites History"
              onClick={() => router.push("/referrals/history")}
              badge={userData.pendingInvites}
            />
            <NavMenuItem
              label="Preferences"
              onClick={() => router.push("/referrals/preferences")}
            />
            <NavMenuItem
              label="Rewards"
              onClick={() => router.push("/referrals/rewards")}
            />
            <NavMenuItem
              label="Terms & Conditions"
              onClick={() => router.push("/referrals/terms")}
            />
            <div className="pt-2 space-y-1">
              <NavMenuItem
                label="Log Out"
                onClick={handleLogout}
              />
              <NavMenuItem
                label="Delete Account"
                onClick={() => setShowDeleteConfirm(true)}
              />
            </div>
          </section>
        </div>
      </main>

      {/* Email Verification Modal - blocks dashboard until verified */}
      <OnboardingModal
        isOpen={isOpen}
        step={step}
        onClose={handleVerificationClose}
        onNextStep={handleVerificationSuccess}
        onPreviousStep={previousStep}
        onGoToStep={goToStep}
      />

      {/* Delete Account Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
