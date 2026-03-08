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
  createdAt: string;
  updatedAt: string;
}

export interface GetInvitesResponse {
  invites: Invite[];
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
