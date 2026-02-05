"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavMenuItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  isActive?: boolean;
}

export function NavMenuItem({
  label,
  href,
  onClick,
  badge,
  isActive = false,
}: NavMenuItemProps) {
  const Component = href ? "a" : "button";

  return (
    <Component
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full px-4 py-3.5 rounded-lg transition-colors",
        "hover:bg-secondary/50",
        isActive && "bg-secondary"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold bg-destructive text-destructive-foreground rounded-full">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Component>
  );
}
