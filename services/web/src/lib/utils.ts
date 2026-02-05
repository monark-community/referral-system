import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with thousands separator using apostrophe
 * e.g., 15000 -> "15'000"
 */
export function formatPoints(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
