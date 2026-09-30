// Purpose: Tests for the desktop sidebar - navigation links, the signed-in user, sign out, and the terms modal

import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useAuth } from "@/contexts/auth-context";
import type { User } from "@/lib/api/auth";
import { buildUser } from "../../fixtures";

const mockPush = jest.fn();
const mockLogout = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/referrals/history",
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

function renderSidebar(user: User | null = buildUser()) {
  jest.mocked(useAuth).mockReturnValue({ user, logout: mockLogout } as unknown as ReturnType<typeof useAuth>);
  render(<SidebarNav />);
}

afterEach(() => {
  jest.clearAllMocks();
});

test.each([
  ["Home", "/referrals"],
  ["Profile", "/referrals/profile"],
  ["How it Works", "/referrals/how-it-works"],
  ["History", "/referrals/history"],
  ["Rewards", "/referrals/rewards"],
  ["Preferences", "/referrals/preferences"],
])("links %s to %s", (label, href) => {
  renderSidebar();

  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
});

test("highlights the link for the current page", () => {
  renderSidebar();

  expect(screen.getByRole("link", { name: "History" })).toHaveClass("bg-secondary");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveClass("bg-secondary");
});

test("shows the signed-in user's name and shortened wallet", () => {
  renderSidebar(buildUser({ name: "Alice" }));

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
});

test("hides the user section when nobody is signed in", () => {
  renderSidebar(null);

  expect(screen.queryByRole("button", { name: "Sign Out" })).not.toBeInTheDocument();
});

test("Sign Out logs out and returns to the welcome page", async () => {
  renderSidebar();

  await userEvent.click(screen.getByRole("button", { name: "Sign Out" }));

  expect(mockLogout).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/referrals/welcome");
});

test("opens and closes the terms and conditions", async () => {
  renderSidebar();

  await userEvent.click(screen.getByRole("button", { name: "Terms & Conditions" }));
  expect(screen.getByText("LedgerLift Referral Program: Terms and Conditions")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitForElementToBeRemoved(() =>
    screen.queryByText("LedgerLift Referral Program: Terms and Conditions"),
  );
});
