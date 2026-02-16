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
          ? "bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30"
          : "bg-gradient-to-br from-orange-400/15 to-orange-500/5 border border-orange-400/20"
      )}
    >
      <div
        className={cn(
          "text-2xl font-bold",
          variant === "earned" ? "text-orange-400" : "text-orange-300"
        )}
      >
        {formatPoints(points)}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
