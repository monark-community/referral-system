// Purpose: Tests for the auth context - restoring a session from the stored token, login/logout, and refreshUser
// Notes:
// - getCurrentUser is mocked; everything else (React Query, localStorage) is real

import type { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { getCurrentUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { buildUser } from "../fixtures";

jest.mock("@/lib/api/auth", () => ({
  ...jest.requireActual("@/lib/api/auth"),
  getCurrentUser: jest.fn(),
}));

const mockGetCurrentUser = jest.mocked(getCurrentUser);

function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useAuth(), { wrapper }) };
}

describe("AuthProvider", () => {
  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("stays logged out without a stored token and does not call the API", () => {
    const { result } = renderAuth();

    expect(result.current).toMatchObject({ user: null, isAuthenticated: false, isLoading: false });
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });

  test("restores the session from a stored token", async () => {
    localStorage.setItem("token", "jwt-123");
    const user = buildUser();
    mockGetCurrentUser.mockResolvedValue({ user });

    const { result } = renderAuth();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user).toEqual(user);
    expect(result.current.isLoading).toBe(false);
  });

  test("drops a stored token the API rejects", async () => {
    localStorage.setItem("token", "expired");
    mockGetCurrentUser.mockRejectedValue(new ApiError("Invalid token", 401));

    const { result } = renderAuth();

    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
    expect(result.current.user).toBeNull();
  });

  test("login stores the token and exposes the user", () => {
    const user = buildUser();
    const { result } = renderAuth();

    act(() => result.current.login("jwt-123", user));

    expect(localStorage.getItem("token")).toBe("jwt-123");
    expect(result.current).toMatchObject({ user, isAuthenticated: true });
  });

  test("logout clears the token, the user, and cached queries", () => {
    const { result, queryClient } = renderAuth();
    act(() => result.current.login("jwt-123", buildUser()));
    queryClient.setQueryData(["invites"], { invites: [] });

    act(() => result.current.logout());

    expect(localStorage.getItem("token")).toBeNull();
    expect(result.current).toMatchObject({ user: null, isAuthenticated: false });
    expect(queryClient.getQueryData(["invites"])).toBeUndefined();
  });

  test("updateUser replaces the current user", () => {
    const { result } = renderAuth();
    act(() => result.current.login("jwt-123", buildUser()));

    act(() => result.current.updateUser(buildUser({ name: "Alice Updated" })));

    expect(result.current.user?.name).toBe("Alice Updated");
  });

  test("refreshUser loads the latest user from the API", async () => {
    const { result } = renderAuth();
    act(() => result.current.login("jwt-123", buildUser({ earnedPoints: 0 })));
    mockGetCurrentUser.mockResolvedValue({ user: buildUser({ earnedPoints: 250 }) });

    await act(() => result.current.refreshUser());

    expect(result.current.user?.earnedPoints).toBe(250);
  });

  test("refreshUser logs out when the token has expired", async () => {
    const { result } = renderAuth();
    act(() => result.current.login("jwt-123", buildUser()));
    mockGetCurrentUser.mockRejectedValue(new ApiError("Token expired", 401));

    await act(() => result.current.refreshUser());

    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("token")).toBeNull();
  });

  test("refreshUser keeps the session on a transient server error", async () => {
    const { result } = renderAuth();
    act(() => result.current.login("jwt-123", buildUser()));
    mockGetCurrentUser.mockRejectedValue(new ApiError("Internal server error", 500));

    await act(() => result.current.refreshUser());

    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem("token")).toBe("jwt-123");
  });
});

describe("useAuth", () => {
  test("throws when used outside an AuthProvider", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used within an AuthProvider");

    jest.restoreAllMocks();
  });
});
