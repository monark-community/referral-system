"use client";

import { useState } from "react";
import { Copy, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReferralLinkCardProps {
  referralLink: string;
  onShare?: () => void;
}

export function ReferralLinkCard({ referralLink, onShare }: ReferralLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Reffinity!",
          text: "Use my referral link to join and we both earn rewards!",
          url: referralLink,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to share:", err);
        }
      }
    } else {
      onShare?.();
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground">
        Your Referral Link
      </label>
      <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border-border">
        <input
          type="text"
          value={referralLink}
          readOnly
          className="flex-1 bg-transparent text-sm text-foreground outline-none truncate"
        />
        <button
          onClick={handleCopy}
          className={cn(
            "p-2 rounded-md transition-colors",
            "hover:bg-secondary",
            copied && "text-success"
          )}
          aria-label={copied ? "Copied" : "Copy link"}
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <Button onClick={handleShare} className="w-full" size="lg">
        <Share2 className="w-4 h-4" />
        Share
      </Button>
    </div>
  );
}
