"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
import { cn } from "@/lib/utils";

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ id, checked, onChange }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-secondary"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

interface PreferenceItemProps {
  id: string;
  label: string;
  description?: string;
  warning?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function PreferenceItem({
  id,
  label,
  description,
  warning,
  checked,
  onChange,
}: PreferenceItemProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 space-y-1">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        {description && (
          <p
            className={cn(
              "text-xs",
              warning ? "text-orange-400" : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        )}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

export default function PreferencesPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState({
    activateProgram: true,
    autoAcceptUnknown: false,
    autoBlockSuspicious: true,
    autoRemoveCompromised: true,
  });

  const updatePreference = (key: keyof typeof preferences) => (value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-screen bg-background flex flex-col max-w-md mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="Preferences"
        onBack={() => router.push("/referrals")}
        onClose={() => router.push("/referrals")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* General Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              General
            </h2>
            <div className="rounded-lg border border-border bg-card p-4">
              <PreferenceItem
                id="activate-program"
                label="Activate Referrals Program"
                checked={preferences.activateProgram}
                onChange={updatePreference("activateProgram")}
              />
            </div>
          </section>

          {/* Security Section */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Security
            </h2>
            <div className="rounded-lg border border-border bg-card p-4 space-y-1 divide-y divide-border">
              <PreferenceItem
                id="auto-accept"
                label="Automatically accept unknown referees to network"
                description="Discouraged, may negatively affect your Network Trust Score"
                warning
                checked={preferences.autoAcceptUnknown}
                onChange={updatePreference("autoAcceptUnknown")}
              />
              <PreferenceItem
                id="auto-block"
                label="Automatically block suspicious referees"
                description="Recommended to protect your network score"
                checked={preferences.autoBlockSuspicious}
                onChange={updatePreference("autoBlockSuspicious")}
              />
              <PreferenceItem
                id="auto-remove"
                label="Automatically remove compromised referees"
                description="Recommended, earned points will be lost"
                warning
                checked={preferences.autoRemoveCompromised}
                onChange={updatePreference("autoRemoveCompromised")}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
