"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PointsChartProps {
  earnedPoints: number;
  pendingPoints: number;
  createdAt: string;
}

/**
 * Generate synthetic chart data points from account creation to now,
 * simulating a growth curve for earned points.
 */
function generateChartData(earnedPoints: number, createdAt: string) {
  const now = new Date();
  const start = new Date(createdAt);
  const data: { date: string; points: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // If the date is before account creation, points are 0
    // Otherwise, ease in based on how far through the 7 days we are
    let points = 0;
    if (date >= start) {
      const ratio = (7 - i) / 7;
      points = Math.round(Math.pow(ratio, 1.4) * earnedPoints);
    }

    data.push({
      date: date.toLocaleDateString("en-US", { weekday: "short" }),
      points,
    });
  }

  return data;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">
        {payload[0].value.toLocaleString()} pts
      </p>
    </div>
  );
}

export function PointsChart({
  earnedPoints,
  pendingPoints,
  createdAt,
}: PointsChartProps) {
  const data = useMemo(
    () => generateChartData(earnedPoints, createdAt),
    [earnedPoints, createdAt]
  );

  const totalPoints = earnedPoints + pendingPoints;

  return (
    <div className="space-y-4">
      {/* Big number hero */}
      <div>
        <p className="text-[13px] text-muted-foreground">Total Points</p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-4xl font-bold tracking-tight text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            {totalPoints.toLocaleString()}
          </span>
          {pendingPoints > 0 && (
            <span className="text-[13px] font-medium text-orange-400" style={{ fontVariantNumeric: "tabular-nums" }}>
              +{pendingPoints.toLocaleString()} pending
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[180px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pointsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(25, 95%, 53%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(0, 0%, 64%)" }}
              dy={8}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="points"
              stroke="hsl(25, 95%, 53%)"
              strokeWidth={2}
              fill="url(#pointsGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "hsl(25, 95%, 53%)",
                stroke: "hsl(0, 0%, 7%)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
