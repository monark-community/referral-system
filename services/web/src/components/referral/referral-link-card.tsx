"use client";

import { useState, lazy, Suspense } from "react";
import { Copy, Share2, Check, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ReferralQRCode = lazy(() =>
  import("./referral-qr-code").then((m) => ({ default: m.ReferralQRCode }))
);

interface ReferralLinkCardProps {
  referralLink: string;
  onShare?: () => void;
}

export function ReferralLinkCard({ referralLink, onShare }: ReferralLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  const shareText = "Use my referral link to join Reffinity and we both earn rewards!";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Reffinity!", text: shareText, url: referralLink });
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error("Failed to share:", err);
      }
    } else {
      setShowShareOptions(!showShareOptions);
      onShare?.();
    }
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent("Join me on Reffinity!");
    const body = encodeURIComponent(`${shareText}\n\n${referralLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(`${shareText} ${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareViaTelegram = () => {
    const text = encodeURIComponent(shareText);
    const url = encodeURIComponent(referralLink);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
  };

  const shareViaX = () => {
    const text = encodeURIComponent(`${shareText} ${referralLink}`);
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground">
        Your Referral Link
      </label>
      <div className="flex items-center gap-2 p-3 bg-card/50 rounded-xl surface-card">
        <input
          type="text"
          value={referralLink}
          readOnly
          className="flex-1 bg-transparent text-sm text-foreground outline-none truncate font-mono"
        />
        <button
          onClick={handleCopy}
          className={cn(
            "p-2 rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.96]",
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

      <Button onClick={handleNativeShare} className="w-full" size="lg">
        <Share2 className="w-4 h-4" />
        Share
      </Button>

      {showShareOptions && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={shareViaEmail}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card/50 surface-card hover:surface-card-hover active:scale-[0.96] transition-[box-shadow,transform] duration-150"
          >
            <Mail className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Email</span>
          </button>
          <button
            onClick={shareViaWhatsApp}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card/50 surface-card hover:surface-card-hover active:scale-[0.96] transition-[box-shadow,transform] duration-150"
          >
            <MessageCircle className="w-5 h-5 text-green-500" />
            <span className="text-xs text-muted-foreground">WhatsApp</span>
          </button>
          <button
            onClick={shareViaTelegram}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card/50 surface-card hover:surface-card-hover active:scale-[0.96] transition-[box-shadow,transform] duration-150"
          >
            <Send className="w-5 h-5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Telegram</span>
          </button>
          <button
            onClick={shareViaX}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card/50 surface-card hover:surface-card-hover active:scale-[0.96] transition-[box-shadow,transform] duration-150"
          >
            <span className="text-lg font-bold text-muted-foreground">&#120143;</span>
            <span className="text-xs text-muted-foreground">X</span>
          </button>
        </div>
      )}

      <Suspense fallback={null}>
        <ReferralQRCode referralLink={referralLink} />
      </Suspense>
    </div>
  );
}
