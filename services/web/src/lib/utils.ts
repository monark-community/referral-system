// Purpose: Shared utility functions - Tailwind class merging (cn), number formatting, and referral link code parsing

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with thousands separator using comma
 * e.g., 15000 -> "15,000"
 */
export function formatPoints(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* 
Parse the link code into valid  referral and invite codes
*/
export function parseLinkCode(code?: string): {
  referralCode: string | null;
  inviteCode: string | null;
} {
  if (!code) {
    return {
      referralCode: null,
      inviteCode: null,
    };
  }

  const codes = code.split(/-/, 2);

  return {
    referralCode: codes[0] ?? null,
    inviteCode: codes.length > 1 ? codes[1] : null,
  };
}
