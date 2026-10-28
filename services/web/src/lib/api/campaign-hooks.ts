"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getCampaigns, getMyCampaigns } from "./campaigns";

export function useCampaignBoard() {
  const { isAuthenticated, user } = useAuth();
  return useQuery({
    queryKey: ["campaigns", user?.id, "board"],
    queryFn: getCampaigns,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
}

export function useMyCampaigns() {
  const { isAuthenticated, user } = useAuth();
  return useQuery({
    queryKey: ["campaigns", user?.id, "mine"],
    queryFn: getMyCampaigns,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
}

export function useRefreshCampaigns() {
  const client = useQueryClient();
  const { refreshUser } = useAuth();
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["campaigns"] }),
      client.invalidateQueries({ queryKey: ["referral-reward-history"] }),
      client.invalidateQueries({ queryKey: ["user-milestone"] }),
      refreshUser(),
    ]);
  }, [client, refreshUser]);
}
