"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfile, getInvites, getMilestoneTiers, getUserMilestone } from "./user";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
  });
}

export function useInvites() {
  return useQuery({
    queryKey: ["invites"],
    queryFn: () => getInvites(),
  });
}

export function useMilestoneTiers() {
  return useQuery({
    queryKey: ["milestone-tiers"],
    queryFn: () => getMilestoneTiers(),
  });
}

export function useUserMilestone() {
  return useQuery({
    queryKey: ["user-milestone"],
    queryFn: () => getUserMilestone(),
  });
}
