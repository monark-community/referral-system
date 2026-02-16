import { apiClient } from './client';

export interface User {
  id: string;
  walletAddress: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  referralCode: string;
  earnedPoints: number;
  pendingPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  isNewUser: boolean;
}

export interface GetMeResponse {
  user: User;
}

/**
 * Authenticate with wallet signature
 */
export async function walletAuth(
  walletAddress: string,
  signature: string,
  message: string
): Promise<AuthResponse> {
  return apiClient<AuthResponse>('/auth/wallet', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, signature, message }),
  });
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<GetMeResponse> {
  return apiClient<GetMeResponse>('/auth/me');
}

/**
 * Logout (client-side token removal)
 */
export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
}
