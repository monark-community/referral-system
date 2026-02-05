"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
import { Button } from "@/components/ui/button";

const steps = [
  {
    number: 1,
    title: "Spread the Word",
    description:
      "Use your referral link to invite friends or share Monark with your followers. From Monark enthusiasts to major influencers, everyone is eligible to earn points as they help expand the ecosystem.",
  },
  {
    number: 2,
    title: "Grow Your Circle, Boost Your Score",
    description:
      "When your friends join, they become part of your personal Monark Network. Because these connections contribute to your Network Trust Score, you're encouraged to invite reliable users.",
    links: [{ text: "Network Trust Score", href: "/trust-score" }],
  },
  {
    number: 3,
    title: "Stay in Control",
    description:
      "Use your personal dashboard to track your invites in real-time, monitor your growing Trust Score, and see exactly how close you are to your next milestone. Your network, your data, your progress.",
  },
  {
    number: 4,
    title: "Unlock the Monark Ecosystem",
    description:
      "Your points are more than just numbers; they are your ticket to exclusive perks. Destroy paywalls and redeem premium services, or specialized rewards across the entire Monark suite of tools!",
  },
];

export default function HowItWorksPage() {
  const router = useRouter();

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="How it Works"
        onBack={() => router.push("/referrals/welcome")}
        onClose={() => router.push("/referrals/welcome")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}

          {/* Rewards Link */}
          <button
            onClick={() => router.push("/referrals/rewards")}
            className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <span className="text-sm font-medium">Rewards</span>
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="p-4 border-t border-border">
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => router.push("/referrals/welcome")}
          >
            Got it!
          </Button>
          <Button className="flex-1" onClick={() => router.push("/referrals/terms")}>
            Join the Program
          </Button>
        </div>
      </footer>
    </div>
  );
}
