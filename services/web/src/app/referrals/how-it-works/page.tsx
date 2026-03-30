"use client";

import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

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

  const footerContent = (
    <footer className="p-4 border-t border-border lg:border-t-0 lg:pt-0 lg:px-0">
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => router.push("/referrals/welcome")}>
          Got it!
        </Button>
        <Button className="flex-1" onClick={() => router.push("/referrals/terms")}>
          Join the Program
        </Button>
      </div>
    </footer>
  );

  return (
    <ResponsiveShell
      title="How it Works"
      onBack={() => router.push("/referrals/welcome")}
      onClose={() => router.push("/referrals/welcome")}
      showSidebar={false}
      footer={footerContent}
    >
      <div className="p-4 space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground tabular-nums">{step.number}</span>
            </div>
            <div className="flex-1 space-y-1.5">
              <h3 className="font-semibold text-foreground" style={{ textWrap: "balance" }}>{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed" style={{ textWrap: "pretty" }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}

        <button
          onClick={() => router.push("/referrals/rewards")}
          className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl bg-card/50 surface-card hover:surface-card-hover active:scale-[0.98] transition-[box-shadow,transform] duration-150"
        >
          <span className="text-sm font-medium">Rewards</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </ResponsiveShell>
  );
}
