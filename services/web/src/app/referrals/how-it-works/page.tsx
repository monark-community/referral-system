"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Button } from "@/components/ui/button";
import { ChevronRight, Gift, Star, Trophy, Zap } from "lucide-react";

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

const totalAnimatedItems = steps.length + 1; // steps + rewards card

export default function HowItWorksPage() {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setVisibleCount(current);
      if (current >= totalAnimatedItems) clearInterval(interval);
    }, 180);
    return () => clearInterval(interval);
  }, []);

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
        {steps.map((step, index) => (
          <div
            key={step.number}
            className="flex gap-4"
            style={{
              opacity: index < visibleCount ? 1 : 0,
              transform: index < visibleCount ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 400ms ease, transform 400ms ease",
            }}
          >
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

        {/* Rewards card — visually distinct */}
        <button
          onClick={() => router.push("/referrals/rewards")}
          className="w-full rounded-2xl p-[1px] active:scale-[0.98] transition-[transform] duration-150 group"
          style={{
            opacity: steps.length < visibleCount ? 1 : 0,
            transform: steps.length < visibleCount ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 400ms ease, transform 400ms ease",
            background: "linear-gradient(135deg, hsl(25 95% 53% / 0.5), hsl(45 93% 47% / 0.3), hsl(25 95% 53% / 0.15))",
          }}
        >
          <div className="rounded-[15px] bg-card/95 px-5 py-4 flex items-center gap-4">
            <div className="flex -space-x-1.5 shrink-0">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-card">
                <Gift className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center ring-2 ring-card">
                <Star className="w-3.5 h-3.5 text-primary/80" />
              </div>
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-card">
                <Trophy className="w-3.5 h-3.5 text-primary/60" />
              </div>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-foreground">View Rewards</p>
              <p className="text-xs text-muted-foreground">Unlock tiers as you grow your network</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-[color,transform] duration-150" />
          </div>
        </button>
      </div>
    </ResponsiveShell>
  );
}
