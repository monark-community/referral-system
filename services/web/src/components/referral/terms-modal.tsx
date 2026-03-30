"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function TermsContent() {
  return (
    <div className="space-y-6 text-sm">
      <div>
        <h2 className="font-semibold text-foreground mb-2">
          LedgerLift Referral Program: Terms and Conditions
        </h2>
        <p className="text-xs text-muted-foreground">
          Last Updated: 2026-01-05
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">1. Overview</h3>
        <p className="text-muted-foreground leading-relaxed">
          The LedgerLift Referral Program (&ldquo;The Program&rdquo;) is designed to reward
          existing Monark users (&ldquo;Referrers&rdquo;) for inviting new users (&ldquo;Referees&rdquo;) to
          join the Monark platform. By participating in The Program, you agree to be
          bound by these Terms and Conditions.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">2. Eligibility</h3>
        <p className="text-muted-foreground leading-relaxed">
          To participate in The Program, you must:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
          <li>Be a registered Monark user with an account in good standing.</li>
          <li>Be at least 18 years of age.</li>
          <li>Reside in a jurisdiction where Monark services are legally permitted.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">3. Referral Requirements</h3>
        <p className="text-muted-foreground leading-relaxed">
          A &ldquo;Qualified Referral&rdquo; is defined as a new user who:
        </p>
        <ol className="list-decimal list-inside text-muted-foreground space-y-1 ml-2">
          <li>Signs up for Monark using your unique LedgerLift Referral Link.</li>
          <li>Completes the identity verification process (KYC).</li>
          <li>
            Executes a qualifying action (e.g., a minimum deposit of $500 or their
            first trade) within 30 days of registration.
          </li>
        </ol>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">4. Rewards Structure</h3>
        <p className="text-muted-foreground leading-relaxed">
          The LedgerLift Referral Program offers tiered incentives designed to
          reward both consistent and high-volume advocates. Rewards are
          cumulative and distributed based on the following milestones:
        </p>
        <p className="text-muted-foreground leading-relaxed mt-2">
          <strong>Standard Referral Bonus:</strong> For every individual Qualified Referral, the
          Referrer will receive a $25 Account Credit deposited directly into their
          primary Monark wallet.
        </p>
      </section>
    </div>
  );
}

export function TermsModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        backdropFilter: visible ? "blur(6px)" : "blur(0px)",
        backgroundColor: visible ? "hsl(0 0% 0% / 0.5)" : "hsl(0 0% 0% / 0)",
        transition: "backdrop-filter 200ms ease, background-color 200ms ease",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative rounded-2xl bg-card border border-border shadow-xl flex flex-col max-w-lg w-full max-h-[80vh]"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.95)",
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-base font-semibold text-foreground">Terms & Conditions</h2>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 overscroll-contain">
          <TermsContent />
        </div>
      </div>
    </div>,
    document.body
  );
}
