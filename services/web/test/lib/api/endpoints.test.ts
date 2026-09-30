// Purpose: Checks that each frontend API function calls the matching Express route with the right method and body
// Notes:
// - apiClient is mocked, so these tests only cover the request each function builds

import { apiClient } from "@/lib/api/client";
import { walletAuth, getCurrentUser, logout } from "@/lib/api/auth";
import {
  updateProfile,
  getProfile,
  sendVerificationEmail,
  getInvites,
  getReferralRewardHistory,
  acceptTerms,
  disableAccount,
  enableAccount,
  getMilestoneTiers,
  getUserMilestone,
  createPrivateInvite,
} from "@/lib/api/user";

jest.mock("@/lib/api/client", () => ({
  apiClient: jest.fn().mockResolvedValue({}),
}));

const mockApiClient = jest.mocked(apiClient);

beforeEach(() => {
  mockApiClient.mockClear();
});

test.each([
  ["getCurrentUser", getCurrentUser, "/auth/me"],
  ["getProfile", getProfile, "/users/profile"],
  ["getInvites", getInvites, "/users/referrals"],
  ["getReferralRewardHistory", getReferralRewardHistory, "/users/referral-rewards"],
  ["getMilestoneTiers", getMilestoneTiers, "/milestones/tiers"],
  ["getUserMilestone", getUserMilestone, "/milestones/user"],
])("%s sends GET %s", async (_name, call, endpoint) => {
  await call();

  expect(mockApiClient).toHaveBeenCalledWith(endpoint);
});

test.each([
  ["sendVerificationEmail", sendVerificationEmail, "/users/verify-email/send"],
  ["acceptTerms", acceptTerms, "/users/accept-terms"],
  ["disableAccount", disableAccount, "/users/disable"],
  ["enableAccount", enableAccount, "/users/enable"],
])("%s sends POST %s", async (_name, call, endpoint) => {
  await call();

  expect(mockApiClient).toHaveBeenCalledWith(endpoint, { method: "POST" });
});

test("walletAuth posts the signed message with the stored referral and invite codes", async () => {
  await walletAuth("0xabc", "0xsig", "Sign this", "ALICE12345", "INV12345");

  expect(mockApiClient).toHaveBeenCalledWith("/auth/wallet", {
    method: "POST",
    body: JSON.stringify({
      walletAddress: "0xabc",
      signature: "0xsig",
      message: "Sign this",
      referralCode: "ALICE12345",
      inviteCode: "INV12345",
    }),
  });
});

test("updateProfile sends the profile fields with PUT", async () => {
  await updateProfile({ name: "Alice", email: "alice@example.com" });

  expect(mockApiClient).toHaveBeenCalledWith("/users/profile", {
    method: "PUT",
    body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
  });
});

test("createPrivateInvite posts the invite description", async () => {
  await createPrivateInvite(null);

  expect(mockApiClient).toHaveBeenCalledWith("/users/referrals/private", {
    method: "POST",
    body: JSON.stringify({ description: null }),
  });
});

test("logout removes the stored token without calling the API", () => {
  localStorage.setItem("token", "jwt-123");

  logout();

  expect(localStorage.getItem("token")).toBeNull();
  expect(mockApiClient).not.toHaveBeenCalled();
});
