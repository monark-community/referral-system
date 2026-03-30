"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  User,
  Mail,
  Phone,
  Wallet,
  Trophy,
  Star,
  Pencil,
  Check,
  X,
  Loader2,
  Copy,
  CheckCheck,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { updateProfile, sendVerificationEmail } from "@/lib/api/user";
import { useProfile, useUserMilestone } from "@/lib/api/hooks";
import { cn, formatPoints } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

interface FormData {
  name: string;
  email: string;
  phone: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { updateUser } = useAuth();
  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useProfile();
  const { data: milestoneData } = useUserMilestone();

  const userData = profileData?.user ?? null;
  const milestone = milestoneData ?? null;
  const loading = profileLoading && !profileData;

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    if (userData) {
      setFormData({
        name: userData.name || "",
        email: userData.email || "",
        phone: userData.phone || "",
      });
    }
  }, [userData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    else if (formData.name.length > 100) newErrors.name = "Name must be less than 100 characters";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Please enter a valid email address";
    if (formData.phone && !/^[+]?[\d\s\-()]+$/.test(formData.phone)) newErrors.phone = "Please enter a valid phone number";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    setApiError(null);
    setSuccessMessage(null);
    try {
      const response = await updateProfile({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || undefined,
      });
      updateUser(response.user);
      refetchProfile();
      setIsEditing(false);
      setSuccessMessage("Profile updated successfully");
      if (response.emailChanged) {
        try {
          await sendVerificationEmail();
          setSuccessMessage("Profile updated. Verification email sent to your new address.");
        } catch {
          setSuccessMessage("Profile updated. Please verify your new email address.");
        }
      }
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to update profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setErrors({});
    setApiError(null);
    if (userData) {
      setFormData({ name: userData.name || "", email: userData.email || "", phone: userData.phone || "" });
    }
  };

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleCopyAddress = async () => {
    if (!userData) return;
    await navigator.clipboard.writeText(userData.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResendVerification = async () => {
    setSendingVerification(true);
    try {
      await sendVerificationEmail();
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 4000);
    } catch (err) {
      console.error("Failed to send verification email:", err);
    } finally {
      setSendingVerification(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userData) return null;

  const tierName = milestone?.currentTier?.name || "Starter";

  return (
    <ResponsiveShell
      title="My Profile"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
      desktopTitle="Profile"
      desktopSubtitle="Manage your personal information and track your progress"
    >
      <div className="space-y-5">
        {successMessage && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertDescription className="text-primary">{successMessage}</AlertDescription>
          </Alert>
        )}
        {apiError && (
          <Alert variant="destructive">
            <AlertDescription>{apiError}</AlertDescription>
          </Alert>
        )}

        {/* Desktop: horizontal hero with avatar left, stats right */}
        <div className="hidden lg:flex lg:items-center lg:gap-6 rounded-xl bg-card/50 p-6 surface-card">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 shrink-0">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {userData.name || "Unnamed User"}
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              {truncateAddress(userData.walletAddress)}
            </p>
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="text-center px-4">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-[11px] text-muted-foreground">Tier</p>
              <p className="text-sm font-semibold text-foreground">{tierName}</p>
            </div>
            <div className="w-px bg-border/50" />
            <div className="text-center px-4">
              <Star className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-[11px] text-muted-foreground">Points</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {formatPoints(userData.earnedPoints)}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile: centered avatar */}
        <div className="lg:hidden">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">{userData.name || "Unnamed User"}</h2>
              <p className="text-sm text-muted-foreground">{truncateAddress(userData.walletAddress)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl bg-secondary/50 p-3 text-center surface-card">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Tier</p>
              <p className="text-sm font-semibold text-foreground">{tierName}</p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-3 text-center surface-card">
              <Star className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Points</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{formatPoints(userData.earnedPoints)}</p>
            </div>
          </div>
        </div>

        {/* Profile & Milestone — side by side on desktop */}
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">
          {/* Profile Fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 active:scale-[0.96] transition-[color,transform] duration-150 py-1 px-2 -mr-2 rounded-md"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground active:scale-[0.96] transition-[color,transform] duration-150 py-1 px-2 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 active:scale-[0.96] transition-[color,transform] duration-150 py-1 px-2 rounded-md"
                  >
                    {isSubmitting ? <Spinner size="sm" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-card/50 divide-y divide-border/50 surface-card">
              {/* Name */}
              <div className="p-4">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs" required>Name</Label>
                    <Input id="name" type="text" placeholder="Enter your name" value={formData.name} onChange={handleChange("name")} error={errors.name} disabled={isSubmitting} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="text-sm text-foreground truncate">{userData.name || "Not set"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="p-4">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs" required>Email</Label>
                    <Input id="email" type="email" placeholder="Enter your email" value={formData.email} onChange={handleChange("email")} error={errors.email} disabled={isSubmitting} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm text-foreground truncate">{userData.email || "Not set"}</p>
                    </div>
                    {userData.email && (
                      <div className="shrink-0">
                        {userData.emailVerified ? (
                          <Badge variant="success" className="text-[10px] gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Verified
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="warning" className="text-[10px] gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Unverified
                            </Badge>
                            <button
                              onClick={handleResendVerification}
                              disabled={sendingVerification || verificationSent}
                              className="text-[10px] text-primary hover:text-primary/80 underline transition-colors duration-150 disabled:opacity-50 py-1 px-1"
                            >
                              {verificationSent ? "Sent!" : sendingVerification ? "Sending..." : "Resend"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="p-4">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs">Phone (optional)</Label>
                    <Input id="phone" type="tel" placeholder="Enter your phone number" value={formData.phone} onChange={handleChange("phone")} error={errors.phone} disabled={isSubmitting} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm text-foreground truncate">{userData.phone || "Not set"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet Address */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Wallet Address</p>
                    <p className="text-sm text-foreground font-mono truncate">{userData.walletAddress}</p>
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className="shrink-0 p-2 -mr-1 rounded-lg hover:bg-secondary active:scale-[0.96] transition-[background-color,transform] duration-150"
                    title="Copy address"
                  >
                    {copied ? (
                      <CheckCheck className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Milestone Details */}
          {milestone && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Milestone Progress</h3>
              <div className="rounded-xl bg-card/50 p-5 space-y-4 surface-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Tier</span>
                  <span className="text-sm font-semibold text-foreground">{tierName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Earned Points</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatPoints(userData.earnedPoints)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pending Points</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatPoints(userData.pendingPoints)}</span>
                </div>
                {milestone.nextTier && (
                  <div className="border-t border-border/50 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Next: {milestone.nextTier.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatPoints(milestone.nextTier.pointsRequired)} pts</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-2 rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.min(100, (userData.earnedPoints / milestone.nextTier.pointsRequired) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <Button variant="secondary" className="w-full text-sm" onClick={() => router.push("/referrals/rewards")}>
                  View All Rewards
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ResponsiveShell>
  );
}
