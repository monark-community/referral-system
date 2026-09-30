// Purpose: Tests for the profile page - showing account details, editing the profile, and email verification

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilePage from "@/app/referrals/profile/page";
import { updateProfile, sendVerificationEmail, type UserMilestoneResponse } from "@/lib/api/user";
import { useProfile, useUserMilestone } from "@/lib/api/hooks";
import { useAuth } from "@/contexts/auth-context";
import type { User } from "@/lib/api/auth";
import { buildUser } from "../../fixtures";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/api/user", () => ({
  updateProfile: jest.fn(),
  sendVerificationEmail: jest.fn(),
}));
jest.mock("@/lib/api/hooks", () => ({
  useProfile: jest.fn(),
  useUserMilestone: jest.fn(),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const mockUpdateUser = jest.fn();
const mockRefetchProfile = jest.fn();

const milestone: UserMilestoneResponse = {
  milestoneLevel: 1,
  earnedPoints: 2500,
  currentTier: { level: 1, name: "Bronze", pointsRequired: 1000, benefits: [] },
  nextTier: { level: 2, name: "Silver", pointsRequired: 5000, benefits: [] },
};

function renderPage({
  user = buildUser({ earnedPoints: 2500, pendingPoints: 100, phone: "+1 555 0100" }),
  milestoneData = milestone,
  loading = false,
}: { user?: User; milestoneData?: UserMilestoneResponse | null; loading?: boolean } = {}) {
  jest.mocked(useAuth).mockReturnValue({ updateUser: mockUpdateUser } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useProfile).mockReturnValue({
    data: loading ? undefined : { user },
    isLoading: loading,
    refetch: mockRefetchProfile,
  } as unknown as ReturnType<typeof useProfile>);
  jest.mocked(useUserMilestone).mockReturnValue({ data: milestoneData } as unknown as ReturnType<typeof useUserMilestone>);
  return render(<ProfilePage />);
}

afterEach(() => {
  jest.clearAllMocks();
});

test("shows nothing but a spinner while the profile loads", () => {
  renderPage({ loading: true });

  expect(screen.queryByText("Personal Information")).not.toBeInTheDocument();
});

test("shows the user's details, tier, and points", () => {
  renderPage();

  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
  expect(screen.getByText("0x1111111111111111111111111111111111111111")).toBeInTheDocument();
  expect(screen.getByText("Verified")).toBeInTheDocument();
  expect(screen.getByText("Current Tier").nextElementSibling).toHaveTextContent("Bronze");
  expect(screen.getByText("Earned Points").nextElementSibling).toHaveTextContent("2,500");
  expect(screen.getByText("Next: Silver")).toBeInTheDocument();
});

test("fills the next-tier progress bar in proportion to earned points", () => {
  const { container } = renderPage();

  expect(container.querySelector('[style*="width: 50%"]')).toBeInTheDocument();
});

test("calls a user without a milestone tier a Starter", () => {
  renderPage({ milestoneData: null });

  expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
  expect(screen.queryByText("Milestone Progress")).not.toBeInTheDocument();
});

test("lets an unverified user resend the verification email", async () => {
  jest.mocked(sendVerificationEmail).mockResolvedValue({ success: true, message: "Sent" });
  renderPage({ user: buildUser({ emailVerified: false }) });
  expect(screen.getByText("Unverified")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Resend" }));

  expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Sent!" })).toBeDisabled();
});

test("copies the wallet address", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByTitle("Copy address"));

  await expect(navigator.clipboard.readText()).resolves.toBe("0x1111111111111111111111111111111111111111");
});

describe("editing", () => {
  test("saves the cleaned-up profile and shows a success message", async () => {
    const saved = buildUser({ name: "Alice Smith" });
    jest.mocked(updateProfile).mockResolvedValue({ user: saved, emailChanged: false });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.type(screen.getByLabelText(/Name/), "  Alice Smith ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateProfile).toHaveBeenCalledWith({
      name: "Alice Smith",
      email: "alice@example.com",
      phone: "+1 555 0100",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith(saved);
    expect(mockRefetchProfile).toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Profile updated successfully");
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
  });

  test("sends a new verification email when the email changes", async () => {
    jest.mocked(updateProfile).mockResolvedValue({ user: buildUser(), emailChanged: true });
    jest.mocked(sendVerificationEmail).mockResolvedValue({ success: true, message: "Sent" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.type(screen.getByLabelText(/Email/), "New@Example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.com" }));
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Profile updated. Verification email sent to your new address.")).toBeInTheDocument();
  });

  test("blocks saving an empty name", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test("shows the API error when saving fails", async () => {
    jest.mocked(updateProfile).mockRejectedValue(new Error("Email already in use"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  });

  test("Cancel throws away unsaved changes", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.type(screen.getByLabelText(/Name/), "Someone Else");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText(/Name/)).toHaveValue("Alice");
  });
});
