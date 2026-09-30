// Purpose: Tests for the rewards page - milestone tiers, which ones are unlocked, and the placeholder fallback

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import RewardsPage from "@/app/referrals/rewards/page";
import { useMilestoneTiers, useUserMilestone } from "@/lib/api/hooks";
import type { MilestoneTier } from "@/lib/api/user";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/api/hooks", () => ({
  useMilestoneTiers: jest.fn(),
  useUserMilestone: jest.fn(),
}));

const tiers: MilestoneTier[] = [
  { level: 1, name: "Bronze", pointsRequired: 1000, benefits: ["Bronze badge"] },
  { level: 2, name: "Silver", pointsRequired: 5000, benefits: ["Priority support"] },
  { level: 3, name: "Gold", pointsRequired: 15000, benefits: ["Gold badge"] },
];

function renderPage({
  tierList = tiers,
  earnedPoints = 0,
  loading = false,
}: { tierList?: MilestoneTier[]; earnedPoints?: number; loading?: boolean } = {}) {
  jest.mocked(useMilestoneTiers).mockReturnValue({
    data: loading ? undefined : { tiers: tierList },
    isLoading: loading,
  } as unknown as ReturnType<typeof useMilestoneTiers>);
  jest.mocked(useUserMilestone).mockReturnValue({
    data: loading ? undefined : { earnedPoints, milestoneLevel: 0, currentTier: null, nextTier: null },
    isLoading: loading,
  } as unknown as ReturnType<typeof useUserMilestone>);
  render(<RewardsPage />);
}

test("shows only the spinner while the tiers load", () => {
  renderPage({ loading: true });

  expect(screen.queryByText("Your Progress")).not.toBeInTheDocument();
  expect(screen.queryByText("Bronze")).not.toBeInTheDocument();
});

test("shows the user's points and every configured tier with its benefits", () => {
  renderPage({ earnedPoints: 6000 });

  expect(screen.getByText("Your Progress").nextElementSibling).toHaveTextContent("6,000 points");
  expect(screen.getByRole("heading", { name: "Bronze" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Silver" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Gold" })).toBeInTheDocument();
  expect(screen.getByText("15,000 points")).toBeInTheDocument();
  expect(screen.getByText("Priority support")).toBeInTheDocument();
});

test.each([
  [0, 0],
  [999, 0],
  [1000, 1],
  [5000, 2],
  [20000, 3],
])("with %d points, %d tiers are unlocked", (earnedPoints, unlocked) => {
  renderPage({ earnedPoints });

  expect(screen.queryAllByText("Unlocked")).toHaveLength(unlocked);
});

test("falls back to the placeholder tiers when none are configured", () => {
  renderPage({ tierList: [], earnedPoints: 5000 });

  expect(screen.getByRole("heading", { name: "Platinum" })).toBeInTheDocument();
  expect(screen.getByText("50,000 points")).toBeInTheDocument();
  expect(screen.queryAllByText("Unlocked")).toHaveLength(2);
});
