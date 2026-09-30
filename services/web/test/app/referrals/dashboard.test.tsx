// Purpose: Tests for the referral dashboard - auth redirect, point and referral stats, recent activity, and banners
// Notes:
// - Heavy children (chart, QR code, mobile link card, onboarding modal) are stubbed; they have their own tests
// - wagmi and the contract helper are mocked for the desktop share card

import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReferralsPage from "@/app/referrals/page";
import { useAuth } from "@/contexts/auth-context";
import { useInvites } from "@/lib/api/hooks";
import type { User } from "@/lib/api/auth";
import type { Invite } from "@/lib/api/user";
import { buildInvite, buildUser } from "../../fixtures";

const mockPush = jest.fn();
const mockRefreshUser = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/api/hooks", () => ({ useInvites: jest.fn() }));
jest.mock("@/lib/api/user", () => ({
  createPrivateInvite: jest.fn(),
  getProfile: jest.fn().mockResolvedValue({}),
  getUserMilestone: jest.fn().mockResolvedValue({}),
  getMilestoneTiers: jest.fn().mockResolvedValue({}),
}));
jest.mock("wagmi", () => ({ useWriteContract: () => ({ writeContractAsync: jest.fn() }) }));
jest.mock("wagmi/chains", () => ({ hardhat: { id: 31337 } }));
jest.mock(
  "@reffinity/blockchain-connector/writeReferralContractHelper",
  () => ({ WriteReferralContractHelper: {} }),
  { virtual: true },
);
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/components/referral/points-chart", () => ({ PointsChart: () => null }));
jest.mock("@/components/referral/referral-qr-code", () => ({ ReferralQRCode: () => null }));
jest.mock("@/components/referral/referral-link-card", () => ({ ReferralLinkCard: () => null }));
jest.mock("@/components/onboarding", () => ({
  OnboardingModal: ({ isOpen, step }: { isOpen: boolean; step: string }) =>
    isOpen ? <div role="dialog">{`onboarding step: ${step}`}</div> : null,
}));

function renderPage({
  user = buildUser({ earnedPoints: 1500, pendingPoints: 200 }) as User | null,
  isLoading = false,
  invites = [] as Invite[],
} = {}) {
  jest.mocked(useAuth).mockReturnValue({
    user,
    isAuthenticated: !!user,
    isLoading,
    refreshUser: mockRefreshUser,
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useInvites).mockReturnValue({ data: { invites } } as unknown as ReturnType<typeof useInvites>);
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, "prefetchQuery");
  render(
    <QueryClientProvider client={queryClient}>
      <ReferralsPage />
    </QueryClientProvider>,
  );
  return { queryClient };
}

// Stat cards show a label with the value underneath
function statCard(label: string) {
  return screen.getByText(label).closest("div.rounded-xl") as HTMLElement;
}

function activityCard() {
  return screen.getByRole("heading", { name: "Recent Activity" }).closest("div.rounded-xl") as HTMLElement;
}

afterEach(() => {
  jest.clearAllMocks();
});

test("sends a logged-out visitor to the welcome page", () => {
  renderPage({ user: null });

  expect(mockPush).toHaveBeenCalledWith("/referrals/welcome");
  expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
});

test("renders nothing and does not redirect while the session is loading", () => {
  renderPage({ user: null, isLoading: true });

  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
});

test("refreshes the user and prefetches the other pages' data on load", () => {
  const { queryClient } = renderPage();

  expect(mockRefreshUser).toHaveBeenCalled();
  const prefetchedKeys = jest.mocked(queryClient.prefetchQuery).mock.calls.map(([options]) => options.queryKey);
  expect(prefetchedKeys).toEqual([["profile"], ["user-milestone"], ["milestone-tiers"]]);
});

test("shows earned and pending points and the referral link", () => {
  renderPage();

  expect(statCard("Earned Points")).toHaveTextContent("1,500");
  expect(statCard("Pending Points")).toHaveTextContent("200");
  expect(screen.getByText(/\/invite\/ALICE12345$/)).toBeInTheDocument();
});

test("counts only verified invites as referrals", () => {
  renderPage({
    invites: [
      buildInvite({ id: "i1", status: 1 }),
      buildInvite({ id: "i2", status: 0 }),
      buildInvite({ id: "i3", status: 1, isVerified: false }),
    ],
  });

  expect(statCard("Total Referrals")).toHaveTextContent("2");
  expect(statCard("Total Referrals")).toHaveTextContent("1 confirmed");
});

test("shows an empty activity state before any referrals", () => {
  renderPage();

  expect(within(activityCard()).getByText(/No referrals yet/)).toBeInTheDocument();
});

test("lists the five most recent invites with their status", () => {
  const invites = [
    ["Bob", 1],
    ["Carol", 0],
    ["Dave", 2],
    ["Erin", 0],
    ["Frank", 0],
    ["Grace", 0],
  ] as const;
  renderPage({
    invites: invites.map(([name, status], index) =>
      buildInvite({ id: `i${index}`, status, points: 100, referee: buildUser({ id: `u${index}`, name }) }),
    ),
  });

  const activity = activityCard();
  expect(within(activity).getByText("Bob").parentElement!.parentElement).toHaveTextContent("+100 pts");
  expect(within(activity).getByText("Carol").parentElement!.parentElement).toHaveTextContent("Pending");
  expect(within(activity).getByText("Dave").parentElement!.parentElement).toHaveTextContent("Cancelled");
  expect(within(activity).getByText("Frank")).toBeInTheDocument();
  expect(within(activity).queryByText("Grace")).not.toBeInTheDocument();
});

test("View all opens the history page", async () => {
  renderPage({ invites: [buildInvite()] });

  await userEvent.click(screen.getByRole("button", { name: "View all" }));

  expect(mockPush).toHaveBeenCalledWith("/referrals/history");
});

test("warns a disabled account and links to Preferences", async () => {
  renderPage({ user: buildUser({ disabledAt: "2026-09-01T00:00:00.000Z" }) });

  const banner = screen.getByText("Your account is disabled").parentElement!;
  await userEvent.click(within(banner).getByRole("button", { name: "Preferences" }));

  expect(mockPush).toHaveBeenCalledWith("/referrals/preferences");
});

test("opens email verification for a user whose email is not verified", () => {
  renderPage({ user: buildUser({ emailVerified: false }) });

  expect(screen.getByRole("dialog")).toHaveTextContent("onboarding step: verify-email");
});
