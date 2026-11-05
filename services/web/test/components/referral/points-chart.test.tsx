import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { PointsChart } from "@/components/referral/points-chart";
import type { DirectRewardEvent, MyCampaigns } from "@/lib/api/campaigns";
import { buildReward } from "../../fixtures";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ data, children }: { data: Array<{ points: number; nativeRewards: number }>; children: ReactNode }) => (
    <svg data-testid="reward-chart" data-values={data.map((point) => `${point.points}:${point.nativeRewards}`).join("|")}>{children}</svg>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

function pointCampaign(): MyCampaigns["joined"][number] {
  return {
    campaign: {
      id: "campaign-1", key: "campaign-1", title: "Campaign", description: "", status: "ACTIVE", isSystem: false,
      owner: { name: null, walletAddress: "0xowner" }, category: "COMMUNITY",
      reward: { type: "POINTS", completerPoints: 250, referralPoolPoints: 50 }, maxCompletions: 10, spotsLeft: 5,
      isPrivate: false, endsAt: "2026-12-01T00:00:00.000Z", publishedAt: null, createdAt: "2026-10-01T00:00:00.000Z",
    },
    fulfillment: {
      id: "fulfillment-1", campaignId: "campaign-1", status: "REWARDED", proof: "proof", rejectionReason: null,
      completerReward: 250, createdAt: "2026-11-04T00:00:00.000Z", submittedAt: null, reviewedAt: null,
      verifiedAt: null, rejectedAt: null, rewardedAt: "2026-11-05T12:00:00.000Z", submission: null, decision: null, reward: null, chain: null,
    },
  };
}

const nativeReward: DirectRewardEvent = {
  id: "native-1", chainId: 31337, transactionHash: "0xnative", logIndex: 1, blockNumber: "10", type: "ACCRUED",
  account: "0x1111111111111111111111111111111111111111", destination: null, amountWei: "1500000000000000000",
  balanceAfterWei: "1500000000000000000", observedAt: "2026-11-05T13:00:00.000Z",
};

const nativeWithdrawal: DirectRewardEvent = {
  ...nativeReward,
  id: "withdrawal-1",
  transactionHash: "0xwithdrawal",
  logIndex: 2,
  type: "WITHDRAWN",
  amountWei: "1000000000000000000",
  balanceAfterWei: "500000000000000000",
  observedAt: "2026-11-05T14:00:00.000Z",
};

test("plots real referral, campaign, and native reward activity", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-11-05T17:00:00.000Z"));
  render(
    <PointsChart
      earnedPoints={1500}
      pendingPoints={200}
      referralRewards={[buildReward({ points: 80, observedAt: "2026-11-05T11:00:00.000Z" })]}
      joinedCampaigns={[pointCampaign()]}
      nativeRewards={[nativeReward, nativeWithdrawal]}
      nativeBalanceWei="500000000000000000"
    />,
  );

  expect(screen.getByText("Reward growth")).toBeInTheDocument();
  expect(screen.getByText("Points rewards")).toBeInTheDocument();
  expect(screen.getByText("Native-chain rewards")).toBeInTheDocument();
  expect(screen.getByText("0.5 native available")).toBeInTheDocument();
  const chart = screen.getByTestId("reward-chart");
  expect(chart).toHaveAttribute("data-values", expect.stringContaining("1500:1.5"));
  const values = chart.getAttribute("data-values")!.split("|").map((value) => value.split(":").map(Number));
  expect(values.every((value, index) => index === 0 || (value[0] >= values[index - 1][0] && value[1] >= values[index - 1][1]))).toBe(true);
  jest.useRealTimers();
});
