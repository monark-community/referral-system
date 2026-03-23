"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/referral";
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
import { getProfile, updateProfile, sendVerificationEmail } from "@/lib/api/user";
import { getUserMilestone } from "@/lib/api/user";
import type { User as UserType } from "@/lib/api/auth";
import type { UserMilestoneResponse } from "@/lib/api/user";
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
  const [userData, setUserData] = useState<UserType | null>(null);
  const [milestone, setMilestone] = useState<UserMilestoneResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData>({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Copy wallet address
  const [copied, setCopied] = useState(false);

  // Verification email
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [profileRes, milestoneRes] = await Promise.all([
          getProfile(),
          getUserMilestone(),
        ]);
        setUserData(profileRes.user);
        setMilestone(milestoneRes);
        setFormData({
          name: profileRes.user.name || "",
          email: profileRes.user.email || "",
          phone: profileRes.user.phone || "",
        });
      } catch (error) {
        console.error("Failed to fetch profile data:", error);
        router.push("/referrals/welcome");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [router]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (formData.name.length > 100) {
      newErrors.name = "Name must be less than 100 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (formData.phone && !/^[+]?[\d\s\-()]+$/.test(formData.phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }

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

      setUserData(response.user);
      updateUser(response.user);
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
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to update profile. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setErrors({});
    setApiError(null);
    if (userData) {
      setFormData({
        name: userData.name || "",
        email: userData.email || "",
        phone: userData.phone || "",
      });
    }
  };

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
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
    <div className="h-screen bg-background flex flex-col max-w-md md:max-w-lg mx-auto overflow-hidden">
      <PageHeader
        subtitle="Referrals Program"
        title="My Profile"
        onBack={() => router.push("/referrals")}
        onClose={() => router.push("/referrals")}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Success Message */}
          {successMessage && (
            <Alert className="border-primary/50 bg-primary/5">
              <AlertDescription className="text-primary">{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {apiError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* Avatar & Summary */}
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">
                {userData.name || "Unnamed User"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {truncateAddress(userData.walletAddress)}
              </p>
            </div>
          </div>

          {/* Milestone & Points Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-secondary/50 p-3 text-center">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Tier</p>
              <p className="text-sm font-semibold text-foreground">{tierName}</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/50 p-3 text-center">
              <Star className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Points</p>
              <p className="text-sm font-semibold text-foreground">
                {formatPoints(userData.earnedPoints)}
              </p>
            </div>
          </div>

          {/* Profile Fields */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {isSubmitting ? (
                      <Spinner size="sm" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Save
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border divide-y divide-border">
              {/* Name */}
              <div className="p-3">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs" required>
                      Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your name"
                      value={formData.name}
                      onChange={handleChange("name")}
                      error={errors.name}
                      disabled={isSubmitting}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="text-sm text-foreground truncate">
                        {userData.name || "Not set"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="p-3">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs" required>
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleChange("email")}
                      error={errors.email}
                      disabled={isSubmitting}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm text-foreground truncate">
                        {userData.email || "Not set"}
                      </p>
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
                              className="text-[10px] text-primary hover:text-primary/80 underline transition-colors disabled:opacity-50"
                            >
                              {verificationSent
                                ? "Sent!"
                                : sendingVerification
                                  ? "Sending..."
                                  : "Resend"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="p-3">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs">
                      Phone (optional)
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      value={formData.phone}
                      onChange={handleChange("phone")}
                      error={errors.phone}
                      disabled={isSubmitting}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm text-foreground truncate">
                        {userData.phone || "Not set"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet Address (read-only) */}
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Wallet Address</p>
                    <p className="text-sm text-foreground font-mono truncate">
                      {userData.walletAddress}
                    </p>
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className="shrink-0 p-1.5 rounded-md hover:bg-secondary transition-colors"
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
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Milestone Progress</h3>
              <div className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Tier</span>
                  <span className="text-sm font-semibold text-foreground">{tierName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Earned Points</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatPoints(userData.earnedPoints)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pending Points</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatPoints(userData.pendingPoints)}
                  </span>
                </div>
                {milestone.nextTier && (
                  <>
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          Next: {milestone.nextTier.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatPoints(milestone.nextTier.pointsRequired)} pts
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              (userData.earnedPoints / milestone.nextTier.pointsRequired) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
                <Button
                  variant="secondary"
                  className="w-full text-sm"
                  onClick={() => router.push("/referrals/rewards")}
                >
                  View All Rewards
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
