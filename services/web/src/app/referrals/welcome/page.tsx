"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
import { Button } from "@/components/ui/button";
import { Gift, Link2, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const features = [
  {
    icon: <Gift className="w-6 h-6" />,
    title: "Free LedgerLift",
    description: "Unlock premium features",
  },
  {
    icon: <Link2 className="w-6 h-6" />,
    title: "More Connected Wallets",
    description: "Expand your network",
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Stronger, Better Network",
    description: "Build trust together",
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: "And More Monark Services",
    description: "Access exclusive tools",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="LedgerLift"
        title="Referrals Program"
        onClose={() => router.push("/")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Hero Section */}
          <div className="relative rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 p-6 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />

            <div className="relative space-y-3">
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Invite Friends, Boost your Network & Earn Together.
              </h1>
              <p className="text-sm text-muted-foreground">
                Gain <span className="text-primary font-semibold">5,000 points</span> for every
                referral while increasing your{" "}
                <span className="text-primary font-semibold">Monark network score</span>. They
                gain 250 points and network start!
              </p>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex flex-col items-center text-center p-4 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors"
              >
                <div className="p-3 rounded-lg bg-secondary text-primary mb-3">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {feature.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="p-4 border-t border-border">
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => router.push("/referrals/how-it-works")}
          >
            How it Works
          </Button>
          {!isLoading && isAuthenticated ? (
            <Button
              className="flex-1"
              onClick={() => router.push("/referrals")}
            >
              Go to Dashboard
            </Button>
          ) : (
            <Button
              className="flex-1"
              disabled={isLoading}
              onClick={() => router.push("/referrals/terms")}
            >
              Join the Program
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
