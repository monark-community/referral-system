// Purpose: Tests for the React Query data hooks - they only fetch once the user is authenticated

import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import {
  useProfile,
  useInvites,
  useReferralRewardHistory,
  useMilestoneTiers,
  useUserMilestone,
} from "@/lib/api/hooks";
import * as userApi from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";

jest.mock("@/lib/api/user", () => ({
  getProfile: jest.fn().mockResolvedValue({ source: "getProfile" }),
  getInvites: jest.fn().mockResolvedValue({ source: "getInvites" }),
  getReferralRewardHistory: jest.fn().mockResolvedValue({ source: "getReferralRewardHistory" }),
  getMilestoneTiers: jest.fn().mockResolvedValue({ source: "getMilestoneTiers" }),
  getUserMilestone: jest.fn().mockResolvedValue({ source: "getUserMilestone" }),
}));

jest.mock("@/contexts/auth-context", () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = jest.mocked(useAuth);

function setAuthenticated(isAuthenticated: boolean) {
  mockUseAuth.mockReturnValue({ isAuthenticated } as ReturnType<typeof useAuth>);
}

function renderQueryHook(hook: () => UseQueryResult<unknown>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

const hooks = [
  ["useProfile", useProfile, "getProfile"],
  ["useInvites", useInvites, "getInvites"],
  ["useReferralRewardHistory", useReferralRewardHistory, "getReferralRewardHistory"],
  ["useMilestoneTiers", useMilestoneTiers, "getMilestoneTiers"],
  ["useUserMilestone", useUserMilestone, "getUserMilestone"],
] as const;

afterEach(() => {
  jest.clearAllMocks();
});

test.each(hooks)("%s does not fetch while logged out", (_name, hook, apiFunction) => {
  setAuthenticated(false);

  const { result } = renderQueryHook(hook);

  expect(result.current.fetchStatus).toBe("idle");
  expect(userApi[apiFunction]).not.toHaveBeenCalled();
});

test.each(hooks)("%s returns data from %s once logged in", async (_name, hook, apiFunction) => {
  setAuthenticated(true);

  const { result } = renderQueryHook(hook);

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({ source: apiFunction });
  expect(userApi[apiFunction]).toHaveBeenCalledTimes(1);
});
