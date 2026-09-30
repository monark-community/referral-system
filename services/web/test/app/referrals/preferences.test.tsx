// Purpose: Tests for the preferences page - disabling (with confirmation) and re-enabling the account

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreferencesPage from "@/app/referrals/preferences/page";
import { disableAccount, enableAccount } from "@/lib/api/user";
import { useProfile } from "@/lib/api/hooks";
import { useAuth } from "@/contexts/auth-context";
import type { User } from "@/lib/api/auth";
import { buildUser } from "../../fixtures";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/api/user", () => ({
  disableAccount: jest.fn(),
  enableAccount: jest.fn(),
}));
jest.mock("@/lib/api/hooks", () => ({ useProfile: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const mockUpdateUser = jest.fn();
const mockRefetchProfile = jest.fn();

function renderPage(user: User) {
  jest.mocked(useAuth).mockReturnValue({ user, updateUser: mockUpdateUser } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useProfile).mockReturnValue({ refetch: mockRefetchProfile } as unknown as ReturnType<typeof useProfile>);
  render(<PreferencesPage />);
  return screen.getByRole("switch", { name: "Activate Account" });
}

afterEach(() => {
  jest.clearAllMocks();
});

test("shows an active account as switched on", () => {
  const toggle = renderPage(buildUser());

  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Your account is active/)).toBeInTheDocument();
});

test("switching the account off waits for confirmation", async () => {
  const toggle = renderPage(buildUser());

  await userEvent.click(toggle);

  expect(disableAccount).not.toHaveBeenCalled();
  expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("confirming disables the account and records when", async () => {
  const user = buildUser();
  jest.mocked(disableAccount).mockResolvedValue({ success: true, disabledAt: "2026-09-29T10:00:00.000Z" });
  const toggle = renderPage(user);

  await userEvent.click(toggle);
  await userEvent.click(screen.getByRole("button", { name: "Disable Account" }));

  expect(disableAccount).toHaveBeenCalledTimes(1);
  expect(mockUpdateUser).toHaveBeenCalledWith({ ...user, disabledAt: "2026-09-29T10:00:00.000Z" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText(/Your account is disabled/)).toBeInTheDocument();
});

test("cancelling keeps the account active", async () => {
  const toggle = renderPage(buildUser());

  await userEvent.click(toggle);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(disableAccount).not.toHaveBeenCalled();
  expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("switching a disabled account back on re-enables it and reloads the profile", async () => {
  const refreshedUser = buildUser({ disabledAt: null });
  jest.mocked(enableAccount).mockResolvedValue({ success: true });
  mockRefetchProfile.mockResolvedValue({ data: { user: refreshedUser } });
  const toggle = renderPage(buildUser({ disabledAt: "2026-09-01T00:00:00.000Z" }));
  expect(toggle).toHaveAttribute("aria-checked", "false");

  await userEvent.click(toggle);

  expect(enableAccount).toHaveBeenCalledTimes(1);
  expect(mockUpdateUser).toHaveBeenCalledWith(refreshedUser);
  expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("security preferences toggle on and off", async () => {
  renderPage(buildUser());
  const autoAccept = screen.getByRole("switch", { name: /accept unknown referees/ });
  expect(autoAccept).toHaveAttribute("aria-checked", "false");

  await userEvent.click(autoAccept);

  expect(autoAccept).toHaveAttribute("aria-checked", "true");
});
