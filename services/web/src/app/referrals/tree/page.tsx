// Purpose: Referral tree page - shows grandparent, parent, you, children and grandchildren as connected circles
// Notes:
// - Ancestors stack above "Me" and referrals fan out below, joined by rounded elbow connectors
// - The tree sits on a pannable canvas: drag with a finger (native scroll) or the mouse; it opens centred on "Me"
// - If the user has no children, a "Refer people" button links to the dashboard share tools

"use client";

import { useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Wallet } from "lucide-react";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useReferralTree } from "@/lib/api/hooks";
import type { TreeUser } from "@/lib/api/user";

type Level = "ancestor" | "me" | "child" | "grandchild";

const avatarSize: Record<Level, string> = {
  ancestor: "w-11 h-11 text-sm",
  me: "w-16 h-16 text-xl",
  child: "w-12 h-12 text-base",
  grandchild: "w-9 h-9 text-xs",
};

const avatarTone: Record<Level, string> = {
  ancestor: "bg-primary/15 text-primary ring-1 ring-primary/40",
  me: "bg-gradient-to-br from-orange-400 to-primary text-primary-foreground ring-4 ring-primary/25 shadow-[0_0_32px_hsl(var(--primary)/0.45)]",
  child: "bg-primary/20 text-primary ring-1 ring-primary/50",
  grandchild: "bg-primary/10 text-primary/90 ring-1 ring-primary/30",
};

// Opaque mix rather than primary/50, so overlapping connector segments don't stack into brighter patches
const line = "border-[color-mix(in_srgb,hsl(var(--primary))_50%,hsl(var(--background)))]";

function displayName(user: TreeUser) {
  return user.name || `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
}

function Avatar({ user, level }: { user: TreeUser; level: Level }) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        avatarSize[level],
        avatarTone[level]
      )}
    >
      {user.name ? user.name.charAt(0).toUpperCase() : <Wallet className="w-1/2 h-1/2" />}
    </div>
  );
}

function Node({ user, level }: { user: TreeUser; level: Level }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 max-w-[112px]">
      <Avatar user={user} level={level} />
      <span className="text-xs font-medium text-foreground truncate max-w-full">{displayName(user)}</span>
      {level === "me" && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          Me
        </span>
      )}
    </div>
  );
}

function Stem({ className }: { className?: string }) {
  return <div className={cn("h-8 border-l-2", line, className)} />;
}

type Position = "only" | "first" | "middle" | "last";

// Draws the top of one sibling's branch: a rounded elbow at either end, a straight tee in between
function Elbow({ position }: { position: Position }) {
  return (
    <div className="relative h-8 w-full">
      {position === "only" && (
        <div className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-full border-l-2", line)} />
      )}
      {position === "first" && (
        <div className={cn("absolute left-[calc(50%-1px)] right-0 top-0 h-full border-l-2 border-t-2 rounded-tl-3xl", line)} />
      )}
      {position === "last" && (
        <div className={cn("absolute left-0 right-[calc(50%-1px)] top-0 h-full border-r-2 border-t-2 rounded-tr-3xl", line)} />
      )}
      {position === "middle" && (
        <>
          <div className={cn("absolute inset-x-0 top-0 border-t-2", line)} />
          <div className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-full border-l-2", line)} />
        </>
      )}
    </div>
  );
}

function Siblings<T extends { id: string }>({
  items,
  spacing,
  render,
}: {
  items: T[];
  spacing: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <div className="flex items-start justify-center">
      {items.map((item, i) => {
        const position: Position =
          items.length === 1 ? "only" : i === 0 ? "first" : i === items.length - 1 ? "last" : "middle";
        return (
          <div key={item.id} className="flex flex-col items-center">
            <Elbow position={position} />
            <div className={cn("flex flex-col items-center", spacing)}>{render(item)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ReferralTreePage() {
  const router = useRouter();
  const { data, isLoading } = useReferralTree();

  const canvasRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Open with "Me" centred horizontally, however wide the tree is
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const me = meRef.current;
    if (!canvas || !me) return;
    const c = canvas.getBoundingClientRect();
    const m = me.getBoundingClientRect();
    canvas.scrollLeft += m.left + m.width / 2 - (c.left + c.width / 2);
  }, [data]);

  // Touch panning is native scrolling; this adds click-and-drag panning for mice
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button")) return;
    const canvas = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    e.currentTarget.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <ResponsiveShell
      title="Referrals"
      onBack={() => router.push("/referrals")}
      onClose={() => router.push("/referrals")}
      desktopTitle="Referrals"
      desktopSubtitle="See who referred you and who you've brought in"
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            "overflow-auto overscroll-contain select-none cursor-grab active:cursor-grabbing",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // Mobile: full-bleed canvas filling the screen under the header; desktop: a rounded panel
            "-m-4 h-[calc(100dvh-65px)]",
            "lg:m-0 lg:h-[calc(100dvh-10rem)] lg:rounded-3xl lg:border lg:border-border"
          )}
        >
          {/* Dot grid moves with the tree, so it reads as a surface you can drag */}
          <div className="flex w-max min-w-full min-h-full flex-col items-center p-12 bg-[radial-gradient(hsl(var(--primary)/0.12)_1px,transparent_1px)] [background-size:22px_22px]">
            {data.grandparent && (
              <>
                <Node user={data.grandparent} level="ancestor" />
                <Stem />
              </>
            )}
            {data.parent && (
              <>
                <Node user={data.parent} level="ancestor" />
                <Stem />
              </>
            )}

            <div ref={meRef}>
              <Node user={data.me} level="me" />
            </div>

            {data.children.length === 0 ? (
              <div className="flex flex-col items-center mt-2">
                <Stem />
                <p className="text-sm text-muted-foreground mb-3">You haven&apos;t referred anyone yet</p>
                <Button onClick={() => router.push("/referrals")} className="rounded-full">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Refer people
                </Button>
              </div>
            ) : (
              <>
                <Stem className="h-6" />
                <Siblings
                  items={data.children}
                  spacing="px-5"
                  render={(child) => (
                    <>
                      <Node user={child} level="child" />
                      {child.referrals.length > 0 && (
                        <>
                          <Stem className="h-5" />
                          <Siblings
                            items={child.referrals}
                            spacing="px-3"
                            render={(gc) => <Node user={gc} level="grandchild" />}
                          />
                        </>
                      )}
                    </>
                  )}
                />
              </>
            )}
          </div>
        </div>
      )}
    </ResponsiveShell>
  );
}
