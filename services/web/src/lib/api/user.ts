import { apiClient } from "./client";
import type { User } from "./auth";

export interface ProfileUpdateRequest {
  name: string;
  email: string;
  phone?: string;
}

export interface ProfileUpdateResponse {
  user: User;
  emailChanged: boolean;
}

export interface ProfileResponse {
  user: User;
}

export interface Invite {
  id: string;
  referrer: User;
  referee: User;
  status: number;
  points: number;
  isVerified: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetInvitesResponse {
  invites: Invite[];
}

export interface PrivateInviteRequest {
  description: string | null;
}

export interface PrivateInviteResponse {
  bytesinviteId: string;
  referralCode: string;
  inviteCode: string;
  referrerWallet: string;
}

/**
 * Update user profile
 */
export async function updateProfile(
  data: ProfileUpdateRequest,
): Promise<ProfileUpdateResponse> {
  return apiClient<ProfileUpdateResponse>("/users/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Get user profile
 */
export async function getProfile(): Promise<ProfileResponse> {
  return apiClient<ProfileResponse>("/users/profile");
}

/**
 * Send email verification
 */
export async function sendVerificationEmail(): Promise<{
  success: boolean;
  message: string;
}> {
  return apiClient("/users/verify-email/send", {
    method: "POST",
  });
}

/**
 * Get User invites
 */
export async function getInvites(): Promise<GetInvitesResponse> {
  return apiClient<GetInvitesResponse>("/users/referrals");
}

/**
 * Disable the current user's account
 */
export async function disableAccount(): Promise<{
  success: boolean;
  disabledAt: string;
}> {
  return apiClient("/users/disable", { method: "POST" });
}

/**
 * Re-enable the current user's account
 */
export async function enableAccount(): Promise<{ success: boolean }> {
  return apiClient("/users/enable", { method: "POST" });
}

export interface MilestoneTier {
  level: number;
  name: string;
  pointsRequired: number;
  benefits: string[];
}

export interface GetMilestoneTiersResponse {
  tiers: MilestoneTier[];
}

export interface UserMilestoneResponse {
  milestoneLevel: number;
  earnedPoints: number;
  currentTier: MilestoneTier | null;
  nextTier: MilestoneTier | null;
}

/**
 * Get all milestone tier definitions
 */
export async function getMilestoneTiers(): Promise<GetMilestoneTiersResponse> {
  return apiClient<GetMilestoneTiersResponse>("/milestones/tiers");
}

/**
 * Get current user's milestone progress
 */
export async function getUserMilestone(): Promise<UserMilestoneResponse> {
  return apiClient<UserMilestoneResponse>("/milestones/user");
}

/*
Create a new private invite for the user
*/
export async function createPrivateInvite(
  description: string | null,
): Promise<PrivateInviteResponse> {
  var data: PrivateInviteRequest = { description: description };
  return apiClient<PrivateInviteResponse>("/users/referrals/private", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
