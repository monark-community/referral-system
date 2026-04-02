"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfile, getInvites, getMilestoneTiers, getUserMilestone } from "./user";
import { useAuth } from "@/contexts/auth-context";

export function useProfile() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });
}

export function useInvites() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["invites"],
    queryFn: () => getInvites(),
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });
}

export function useMilestoneTiers() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["milestone-tiers"],
    queryFn: () => getMilestoneTiers(),
    enabled: isAuthenticated,
  });
}

export function useUserMilestone() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["user-milestone"],
    queryFn: () => getUserMilestone(),
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });
}
