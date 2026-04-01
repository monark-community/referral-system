"use client";

import { cn, formatPoints } from "@/lib/utils";

interface PointsCardProps {
  label: string;
  points: number;
  variant: "earned" | "pending";
}

export function PointsCard({ label, points, variant }: PointsCardProps) {
  return (
    <div
      className={cn(
        "flex-1 rounded-xl p-4 text-center",
        variant === "earned"
          ? "bg-gradient-to-br from-orange-500/20 to-orange-600/10"
          : "bg-gradient-to-br from-orange-400/15 to-orange-500/5"
      )}
      style={{
        boxShadow: variant === "earned"
          ? "0 0 0 1px hsl(25 95% 53% / 0.25), 0 1px 3px hsl(0 0% 0% / 0.4)"
          : "0 0 0 1px hsl(25 95% 53% / 0.15), 0 1px 3px hsl(0 0% 0% / 0.4)",
      }}
    >
      <div
        className={cn(
          "text-2xl font-bold tabular-nums",
          variant === "earned" ? "text-orange-400" : "text-orange-300"
        )}
      >
        {formatPoints(points)}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
