"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReferralQRCodeProps {
  referralLink: string;
}

export function ReferralQRCode({ referralLink }: ReferralQRCodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = () => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  };

  const close = useCallback(() => {
    setVisible(false);
    const timeout = setTimeout(() => setIsOpen(false), 200);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  const handleDownload = () => {
    const svg = document.getElementById("referral-qr-code");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL("image/png");

      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = "reffinity-referral-qr.png";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={open}
        className="w-full"
        size="lg"
      >
        <QrCode className="w-4 h-4" />
        Show QR Code
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            backdropFilter: visible ? "blur(6px)" : "blur(0px)",
            backgroundColor: visible ? "hsl(0 0% 0% / 0.5)" : "hsl(0 0% 0% / 0)",
            transition: "backdrop-filter 200ms ease, background-color 200ms ease",
          }}
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative rounded-2xl bg-card border border-border p-6 shadow-xl flex flex-col items-center gap-4 max-w-[300px] w-full mx-4"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "scale(1)" : "scale(0.95)",
              transition: "opacity 200ms ease, transform 200ms ease",
            }}
          >
            <button
              onClick={close}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-sm font-medium text-foreground">Your QR Code</p>

            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG
                id="referral-qr-code"
                value={referralLink}
                size={200}
                level="M"
                includeMargin
                className="w-full h-auto max-w-[200px]"
              />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Scan to join via your referral link
            </p>

            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
              Download QR Code
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
