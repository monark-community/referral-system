// Purpose: Dashboard chart showing actual referral, campaign, and native-chain reward activity

"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DirectRewardEvent, MyCampaigns } from "@/lib/api/campaigns";
import type { ReferralReward } from "@/lib/api/user";
import { formatNativeAmount, formatNativeAmountExact } from "@/lib/native-amount";

interface PointsChartProps {
  earnedPoints: number;
  pendingPoints: number;
  referralRewards: ReferralReward[];
  joinedCampaigns: MyCampaigns["joined"];
  nativeRewards: DirectRewardEvent[];
  nativeBalanceWei: string;
}

interface RewardChartPoint {
  date: string;
  dateKey: string;
  points: number;
  nativeRewards: number;
  nativeRewardsWei: bigint;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function generateRewardData(
  earnedPoints: number,
  referralRewards: ReferralReward[],
  joinedCampaigns: MyCampaigns["joined"],
  nativeRewards: DirectRewardEvent[],
) {
  const now = new Date();
  const data: RewardChartPoint[] = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    data.push({
      date: date.toLocaleDateString("en-US", { weekday: "short" }),
      dateKey: dayKey(date),
      points: 0,
      nativeRewards: 0,
      nativeRewardsWei: BigInt(0),
    });
  }

  const byDay = new Map(data.map((point) => [point.dateKey, point]));
  for (const reward of referralRewards) {
    const point = byDay.get(dayKey(new Date(reward.observedAt)));
    if (point) point.points += reward.points;
  }
  for (const { campaign, fulfillment } of joinedCampaigns) {
    if (!fulfillment.rewardedAt || campaign.reward.type !== "POINTS") continue;
    const point = byDay.get(dayKey(new Date(fulfillment.rewardedAt)));
    if (point) point.points += Number(fulfillment.completerReward);
  }
  let nativeBeforeWindowWei = BigInt(0);
  const visibleStart = new Date(now);
  visibleStart.setHours(0, 0, 0, 0);
  visibleStart.setDate(visibleStart.getDate() - 6);
  for (const reward of nativeRewards) {
    if (reward.type !== "ACCRUED") continue;
    const observedAt = new Date(reward.observedAt);
    const point = byDay.get(dayKey(observedAt));
    if (point) point.nativeRewardsWei += BigInt(reward.amountWei);
    else if (observedAt < visibleStart) nativeBeforeWindowWei += BigInt(reward.amountWei);
  }

  let runningPoints = Math.max(
    0,
    earnedPoints - data.reduce((total, point) => total + point.points, 0),
  );
  let runningNativeWei = nativeBeforeWindowWei;
  for (const point of data) {
    runningPoints += point.points;
    runningNativeWei += point.nativeRewardsWei;
    point.points = runningPoints;
    point.nativeRewardsWei = runningNativeWei;
    point.nativeRewards = Number(formatNativeAmountExact(runningNativeWei));
  }

  return data;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as RewardChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 space-y-0.5 text-xs tabular-nums">
        <p className="text-foreground">{point.points.toLocaleString()} points earned</p>
        <p className="text-sky-300">{formatNativeAmount(point.nativeRewardsWei)} native rewards</p>
      </div>
    </div>
  );
}

export function PointsChart({
  earnedPoints,
  pendingPoints,
  referralRewards,
  joinedCampaigns,
  nativeRewards,
  nativeBalanceWei,
}: PointsChartProps) {
  const data = useMemo(
    () => generateRewardData(earnedPoints, referralRewards, joinedCampaigns, nativeRewards),
    [earnedPoints, referralRewards, joinedCampaigns, nativeRewards],
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-muted-foreground">Reward growth</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">{earnedPoints.toLocaleString()}</span>
          <span className="text-[13px] text-muted-foreground">points</span>
          <span className="text-[13px] font-medium text-sky-300 tabular-nums">{formatNativeAmount(nativeBalanceWei)} native available</span>
          {pendingPoints > 0 && (
            <span className="text-[13px] font-medium text-orange-400 tabular-nums">+{pendingPoints.toLocaleString()} pending points</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Points rewards</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400" />Native-chain rewards</span>
        </div>
      </div>

      <div className="h-[165px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pointsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0, 0%, 64%)" }} dy={8} />
            <YAxis yAxisId="points" hide />
            <YAxis yAxisId="native" hide orientation="right" />
            <Tooltip content={<CustomTooltip />} />
            <Area yAxisId="points" type="monotone" dataKey="points" stroke="hsl(25, 95%, 53%)" strokeWidth={2} fill="url(#pointsGradient)" dot={false} />
            <Area yAxisId="native" type="monotone" dataKey="nativeRewards" stroke="hsl(199, 89%, 60%)" strokeWidth={2} fill="transparent" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
