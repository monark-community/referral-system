// Purpose: Tests for the invite landing page - it stores the link's codes for onboarding and redirects to welcome

import { render } from "@testing-library/react";
import InvitePage from "@/app/invite/[linkCode]/page";

const mockReplace = jest.fn();
let mockLinkCode = "";

jest.mock("next/navigation", () => ({
  useParams: () => ({ linkCode: mockLinkCode }),
  useRouter: () => ({ replace: mockReplace }),
}));

afterEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("stores the referral code from a public link and redirects to welcome", () => {
  mockLinkCode = "ALICE12345";

  render(<InvitePage />);

  expect(localStorage.getItem("referralCode")).toBe("ALICE12345");
  expect(localStorage.getItem("inviteCode")).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/referrals/welcome");
});

test("stores both codes from a private invite link", () => {
  mockLinkCode = "ALICE12345-INV12345";

  render(<InvitePage />);

  expect(localStorage.getItem("referralCode")).toBe("ALICE12345");
  expect(localStorage.getItem("inviteCode")).toBe("INV12345");
  expect(mockReplace).toHaveBeenCalledWith("/referrals/welcome");
});

test("redirects without storing anything when the link has no code", () => {
  mockLinkCode = "";

  render(<InvitePage />);

  expect(localStorage.getItem("referralCode")).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/referrals/welcome");
});
