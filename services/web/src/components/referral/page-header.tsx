"use client";

import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  onClose,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="relative p-2 -ml-2 rounded-lg hover:bg-secondary active:scale-[0.96] transition-[background-color,transform] duration-150"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <div>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="relative p-2 -mr-2 rounded-lg hover:bg-secondary active:scale-[0.96] transition-[background-color,transform] duration-150"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>
      )}
    </header>
  );
}
