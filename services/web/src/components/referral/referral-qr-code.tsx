"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReferralQRCodeProps {
  referralLink: string;
}

export function ReferralQRCode({ referralLink }: ReferralQRCodeProps) {
  const [showQR, setShowQR] = useState(false);

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
    <div className="space-y-3">
      <Button
        variant="outline"
        onClick={() => setShowQR(!showQR)}
        className="w-full"
        size="lg"
      >
        <QrCode className="w-4 h-4" />
        {showQR ? "Hide QR Code" : "Show QR Code"}
      </Button>

      {showQR && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border bg-card">
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
      )}
    </div>
  );
}
