// Purpose: Tests for the referral history page - invite groups, direct/grandchild reward rows, search, and filters
// Notes:
// - The data hooks are mocked so each test controls exactly which invites and rewards the page receives
// - The layout shell is stubbed; it is covered by the sidebar tests

import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvitesHistoryPage from "@/app/referrals/history/page";
import { useInvites, useReferralRewardHistory } from "@/lib/api/hooks";
import { useMyCampaigns, useMyDirectRewards } from "@/lib/api/campaign-hooks";
import type { DirectRewardEvent, MyCampaigns } from "@/lib/api/campaigns";
import type { Invite, ReferralReward } from "@/lib/api/user";
import { buildInvite, buildReward, buildUser } from "../../fixtures";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/api/hooks", () => ({
  useInvites: jest.fn(),
  useReferralRewardHistory: jest.fn(),
}));
jest.mock("@/lib/api/campaign-hooks", () => ({
  useMyCampaigns: jest.fn(),
  useMyDirectRewards: jest.fn(),
}));

const PENDING = 0;
const ACCEPTED = 1;

const carol = buildUser({ id: "user-3", name: "Carol", walletAddress: "0x3333333333333333333333333333333333333333" });
const dave = buildUser({ id: "user-4", name: "Dave", walletAddress: "0x4444444444444444444444444444444444444444" });

function campaignReward(
  reward: { type: "POINTS"; completerPoints: number; referralPoolPoints: number } | { type: "DIRECT"; completerRewardWei: string; referralPoolWei: string; rewardPerRunWei: string; initialFundingRuns: number; initialFundingWei: string },
  transactionHash = "0xcampaign",
): MyCampaigns["joined"][number] {
  return {
    campaign: {
      id: "campaign-1",
      key: "campaign-1",
      title: "Community launch",
      description: "Launch campaign",
      status: "ACTIVE",
      isSystem: false,
      owner: { name: "Owner", walletAddress: "0xowner" },
      category: "COMMUNITY",
      reward,
      maxCompletions: 10,
      spotsLeft: 4,
      isPrivate: false,
      endsAt: "2026-12-01T00:00:00.000Z",
      publishedAt: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    fulfillment: {
      id: "fulfillment-1",
      campaignId: "campaign-1",
      status: "REWARDED",
      proof: "proof",
      rejectionReason: null,
      completerReward: reward.type === "POINTS" ? reward.completerPoints : reward.completerRewardWei,
      createdAt: "2026-10-30T00:00:00.000Z",
      submittedAt: "2026-10-30T00:00:00.000Z",
      reviewedAt: "2026-10-31T00:00:00.000Z",
      verifiedAt: "2026-10-31T00:00:00.000Z",
      rejectedAt: null,
      rewardedAt: "2026-11-01T00:00:00.000Z",
      submission: null,
      decision: null,
      reward: { transactionHash, blockNumber: "100", logIndex: 2 },
      chain: null,
    },
  };
}

function nativeReward(overrides: Partial<DirectRewardEvent> = {}): DirectRewardEvent {
  return {
    id: "native-1",
    chainId: 31337,
    transactionHash: "0xnative",
    logIndex: 3,
    blockNumber: "101",
    type: "ACCRUED",
    account: "0x1111111111111111111111111111111111111111",
    destination: null,
    amountWei: "1500000000000000000",
    balanceAfterWei: "1500000000000000000",
    observedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderPage({
  invites = [],
  rewards = [],
  campaigns = [],
  nativeRewards = [],
  loading = false,
}: {
  invites?: Invite[];
  rewards?: ReferralReward[];
  campaigns?: MyCampaigns["joined"];
  nativeRewards?: DirectRewardEvent[];
  loading?: boolean;
} = {}) {
  jest.mocked(useInvites).mockReturnValue({
    data: loading ? undefined : { invites },
    isLoading: loading,
  } as unknown as ReturnType<typeof useInvites>);
  jest.mocked(useReferralRewardHistory).mockReturnValue({
    data: loading ? undefined : { rewardHistory: rewards },
    isLoading: loading,
  } as unknown as ReturnType<typeof useReferralRewardHistory>);
  jest.mocked(useMyCampaigns).mockReturnValue({
    data: loading ? undefined : { created: [], joined: campaigns },
    isLoading: loading,
  } as unknown as ReturnType<typeof useMyCampaigns>);
  jest.mocked(useMyDirectRewards).mockReturnValue({
    data: loading ? undefined : {
      wallet: "0x1111111111111111111111111111111111111111",
      chainId: 31337,
      balanceWei: "0",
      history: nativeRewards,
    },
    isLoading: loading,
  } as unknown as ReturnType<typeof useMyDirectRewards>);
  render(<InvitesHistoryPage />);
}

function section(name: string) {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}

// Each section is a heading followed by a list whose children are the rows
function row(sectionName: string, text: string) {
  const rows = Array.from(section(sectionName).lastElementChild!.children) as HTMLElement[];
  return rows.find((element) => within(element).queryByText(text)) as HTMLElement;
}

test("shows the empty state when there is no history", () => {
  renderPage();

  expect(screen.getByText("No history found")).toBeInTheDocument();
});

test("does not show the empty state while loading", () => {
  renderPage({ loading: true });

  expect(screen.queryByText("No history found")).not.toBeInTheDocument();
});

test("groups verified invites into Pending and Earned and hides unverified ones", () => {
  renderPage({
    invites: [
      buildInvite({ id: "i1", status: PENDING, referee: carol }),
      buildInvite({ id: "i2", status: ACCEPTED, referee: dave, points: 100 }),
      buildInvite({ id: "i3", status: PENDING, isVerified: false, description: "Unverified friend" }),
    ],
  });

  expect(row("Pending", "Carol")).toHaveTextContent("Pending");
  expect(row("Earned", "Dave")).toHaveTextContent("100 Points Earned");
  expect(screen.queryByText("Unverified friend")).not.toBeInTheDocument();
});

test("labels direct and grandchild rewards with their level", () => {
  renderPage({
    rewards: [
      buildReward({ id: "r1", logIndex: 0, referralLevel: 1, points: 80, participant: { name: "Bob", walletAddress: "0x2222222222222222222222222222222222222222" } }),
      buildReward({ id: "r2", logIndex: 1, referralLevel: 2, points: 20, participant: { name: "Erin", walletAddress: "0x5555555555555555555555555555555555555555" } }),
    ],
  });

  const bobRow = row("Earned", "Bob");
  const erinRow = row("Earned", "Erin");
  expect(bobRow).toHaveTextContent("80 Points Earned");
  expect(bobRow).toHaveTextContent("Level 1");
  expect(bobRow).toHaveTextContent("Direct referral");
  expect(erinRow).toHaveTextContent("20 Points Earned");
  expect(erinRow).toHaveTextContent("Level 2");
  expect(erinRow).toHaveTextContent("Grandchild");
});

test("shows a shortened wallet address for a participant without a name", () => {
  renderPage({
    rewards: [buildReward({ participant: { name: null, walletAddress: "0xAbCdEf0000000000000000000000000000001234" } })],
  });

  expect(screen.getByText("0xAbCd...1234")).toBeInTheDocument();
});

test("does not repeat an accepted invite that already has a direct reward row", () => {
  const bob = buildUser({ id: "user-2", name: "Bob", walletAddress: "0xB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB" });
  renderPage({
    invites: [
      buildInvite({ id: "i1", status: ACCEPTED, referee: bob, points: 100 }),
      buildInvite({ id: "i2", status: ACCEPTED, referee: carol, points: 100 }),
    ],
    rewards: [
      // The listener stores lowercase addresses, so matching must ignore case
      buildReward({ participant: { name: "Bob", walletAddress: bob.walletAddress.toLowerCase() }, points: 80 }),
    ],
  });

  const earned = section("Earned");
  expect(within(earned).getAllByText("Bob")).toHaveLength(1);
  expect(row("Earned", "Bob")).toHaveTextContent("80 Points Earned");
  // Carol has no reward event yet, so her accepted invite is still shown
  expect(row("Earned", "Carol")).toHaveTextContent("100 Points Earned");
});

test("shows campaign point rewards and native-chain rewards", () => {
  renderPage({
    campaigns: [campaignReward({ type: "POINTS", completerPoints: 250, referralPoolPoints: 50 })],
    nativeRewards: [nativeReward()],
  });

  expect(row("Earned", "Community launch")).toHaveTextContent("250 Points Earned");
  expect(row("Earned", "Native-chain reward")).toHaveTextContent("1.5 Native Earned");
});

test("does not duplicate a direct campaign reward's matching native accrual", () => {
  renderPage({
    campaigns: [campaignReward({
      type: "DIRECT",
      completerRewardWei: "1000000000000000000",
      referralPoolWei: "0",
      rewardPerRunWei: "1000000000000000000",
      initialFundingRuns: 1,
      initialFundingWei: "1000000000000000000",
    })],
    nativeRewards: [nativeReward({ transactionHash: "0xcampaign", amountWei: "1000000000000000000" })],
  });

  const earned = section("Earned");
  expect(within(earned).getByText("Community launch")).toBeInTheDocument();
  expect(within(earned).queryByText("Native-chain reward")).not.toBeInTheDocument();
});

test("search matches rewards by name or wallet and invites by referee name", async () => {
  renderPage({
    invites: [buildInvite({ id: "i1", status: PENDING, referee: carol })],
    rewards: [
      buildReward({ id: "r1", logIndex: 0, participant: { name: "Bob", walletAddress: "0x2222222222222222222222222222222222222222" } }),
      buildReward({ id: "r2", logIndex: 1, participant: { name: null, walletAddress: "0x9999999999999999999999999999999999999999" } }),
    ],
  });
  const search = screen.getByPlaceholderText("Search history...");

  await userEvent.type(search, "bob");
  expect(screen.getByText("Bob")).toBeInTheDocument();
  expect(screen.queryByText("0x9999...9999")).not.toBeInTheDocument();
  expect(screen.queryByText("Carol")).not.toBeInTheDocument();

  await userEvent.clear(search);
  await userEvent.type(search, "0x9999");
  expect(screen.getByText("0x9999...9999")).toBeInTheDocument();
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();

  await userEvent.clear(search);
  await userEvent.type(search, "car");
  expect(screen.getByText("Carol")).toBeInTheDocument();
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();
});

test("filter tabs narrow the list to one status", async () => {
  renderPage({
    invites: [buildInvite({ id: "i1", status: PENDING, referee: carol })],
    rewards: [buildReward({ participant: { name: "Bob", walletAddress: "0x2222222222222222222222222222222222222222" } })],
  });

  await userEvent.click(screen.getByRole("button", { name: "Pending" }));
  expect(screen.getByText("Carol")).toBeInTheDocument();
  expect(screen.queryByText("Bob")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Earned" }));
  expect(screen.getByText("Bob")).toBeInTheDocument();
  expect(screen.queryByText("Carol")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("Bob")).toBeInTheDocument();
  expect(screen.getByText("Carol")).toBeInTheDocument();
});
