"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout";
import { cn } from "@/lib/utils";
import { getProfile, disableAccount, enableAccount } from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ id, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150",
        checked ? "bg-primary" : "bg-secondary",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-150",
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
  disabled?: boolean;
}

function PreferenceItem({ id, label, description, warning, checked, onChange, disabled }: PreferenceItemProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 space-y-1">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        {description && (
          <p className={cn("text-xs", warning ? "text-orange-400" : "text-muted-foreground")} style={{ textWrap: "pretty" }}>
            {description}
          </p>
        )}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function PreferencesPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [isAccountActive, setIsAccountActive] = useState(!user?.disabledAt);
  const [toggling, setToggling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [preferences, setPreferences] = useState({
    autoAcceptUnknown: false,
    autoBlockSuspicious: true,
    autoRemoveCompromised: true,
  });

  const handleToggleAccount = async (activate: boolean) => {
    if (!activate) { setShowConfirm(true); return; }
    setToggling(true);
    try {
      await enableAccount();
      setIsAccountActive(true);
      const res = await getProfile();
      updateUser(res.user);
    } catch (err) {
      console.error("Failed to enable account:", err);
    } finally {
      setToggling(false);
    }
  };

  const handleConfirmDisable = async () => {
    setToggling(true);
    setShowConfirm(false);
    try {
      const res = await disableAccount();
      setIsAccountActive(false);
      if (user) updateUser({ ...user, disabledAt: res.disabledAt });
    } catch (err) {
      console.error("Failed to disable account:", err);
    } finally {
      setToggling(false);
    }
  };

  const updatePreference = (key: keyof typeof preferences) => (value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <ResponsiveShell
      title="Preferences"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
      desktopTitle="Preferences"
      desktopSubtitle="Manage your account settings and security options"
    >
      <div className="space-y-6 lg:max-w-2xl">
        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Account</h2>
          <div className="rounded-xl bg-card/50 px-5 surface-card">
            <PreferenceItem
              id="activate-account"
              label="Activate Account"
              description={isAccountActive
                ? "Your account is active and participating in the referral program"
                : "Your account is disabled. Re-enable to resume participating."}
              warning={!isAccountActive}
              checked={isAccountActive}
              onChange={handleToggleAccount}
              disabled={toggling}
            />
          </div>
        </section>

        {showConfirm && (
          <div className="rounded-xl p-5 space-y-3" style={{ boxShadow: "0 0 0 1px hsl(0 84% 60% / 0.3), 0 1px 3px hsl(0 0% 0% / 0.4)" }}>
            <p className="text-sm font-medium text-foreground">Are you sure you want to disable your account?</p>
            <p className="text-xs text-muted-foreground" style={{ textWrap: "pretty" }}>
              Your referral links will stop working and you will not earn rewards while your account is disabled. You can re-enable your account at any time.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmDisable}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 active:scale-[0.96] transition-[background-color,transform] duration-150"
              >
                Disable Account
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-foreground bg-secondary rounded-xl hover:bg-secondary/80 active:scale-[0.96] transition-[background-color,transform] duration-150"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Security */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Security</h2>
          <div className="rounded-xl bg-card/50 px-5 surface-card divide-y divide-border/30">
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
    </ResponsiveShell>
  );
}
