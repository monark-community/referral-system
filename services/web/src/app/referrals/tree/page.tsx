// Purpose: Referral tree page - shows grandparent, parent, you, children and grandchildren on a pannable canvas
// Notes:
// - Nodes are laid out once in canvas coordinates; connectors are SVG rounded elbows drawn from that layout
// - Drag anywhere to pan; pinch, ctrl/cmd + wheel or the buttons to zoom
// - Hovering a person for a moment shows a tooltip; clicking or tapping them opens a details card in the corner
// - If the user has no children, a "Refer people" button links to the dashboard share tools

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LocateFixed, Minus, Plus, UserPlus, Wallet, X } from "lucide-react";
import { ResponsiveShell } from "@/components/layout/responsive-shell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useReferralTree } from "@/lib/api/hooks";
import type { ReferralTreeResponse, TreeUser } from "@/lib/api/user";

type Level = "ancestor" | "me" | "child" | "grandchild";
type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };

interface TreeNode {
  user: TreeUser;
  level: Level;
  parentId: string | null;
  relation: string;
}

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

// Avatar radius and the height of the name (and "Me" tag) under it, in canvas px
const RADIUS: Record<Level, number> = { ancestor: 22, me: 32, child: 24, grandchild: 18 };
const LABEL: Record<Level, number> = { ancestor: 24, me: 50, child: 24, grandchild: 24 };

// Vertical line length between a person's label and the next avatar, by the level being connected to
const GAP: Record<Level, number> = { ancestor: 32, me: 32, child: 56, grandchild: 52 };
// The sideways bar sits this far above the referrals' avatars, with corners of this radius
const DROP = 32;
const CORNER = 24;

const GRANDCHILD_SLOT = 84;
const CHILD_MIN = 110;
const CHILD_GAP = 40;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
// A press that moves less than this is a tap, not a pan
const TAP_SLOP = 5;
const HOVER_DELAY = 500;

// Opaque mix rather than a translucent primary, so overlapping line segments don't stack brighter
const LINE_COLOR = "color-mix(in srgb, hsl(var(--primary)) 50%, hsl(var(--background)))";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function displayName(user: TreeUser) {
  return user.name || `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
}

// Ancestors stack above "Me"; each child gets enough width for its own referrals and sits centred over them
function buildTree(data: ReferralTreeResponse) {
  const nodes = new Map<string, TreeNode>();
  const layout = new Map<string, Point>();
  let y = 0;
  let prev: Level | null = null;

  // Next row's centre: below the previous person's label, a line, then this avatar's radius
  const nextY = (level: Level) => {
    if (prev) y += RADIUS[prev] + LABEL[prev] + GAP[level] + RADIUS[level];
    prev = level;
    return y;
  };

  if (data.grandparent) {
    nodes.set(data.grandparent.id, {
      user: data.grandparent,
      level: "ancestor",
      parentId: null,
      relation: data.parent ? `Referred ${displayName(data.parent)}` : "Referred your referrer",
    });
    layout.set(data.grandparent.id, { x: 0, y: nextY("ancestor") });
  }
  if (data.parent) {
    nodes.set(data.parent.id, {
      user: data.parent,
      level: "ancestor",
      parentId: data.grandparent?.id ?? null,
      relation: "Referred you",
    });
    layout.set(data.parent.id, { x: 0, y: nextY("ancestor") });
  }

  nodes.set(data.me.id, { user: data.me, level: "me", parentId: data.parent?.id ?? null, relation: "You" });
  layout.set(data.me.id, { x: 0, y: nextY("me") });

  const childY = nextY("child");
  const grandchildY = nextY("grandchild");
  const widths = data.children.map((c) => Math.max(CHILD_MIN, c.referrals.length * GRANDCHILD_SLOT));
  let x = -(widths.reduce((a, b) => a + b, 0) + CHILD_GAP * (widths.length - 1)) / 2;

  data.children.forEach((child, i) => {
    const cx = x + widths[i] / 2;
    nodes.set(child.id, { user: child, level: "child", parentId: data.me.id, relation: "You referred them" });
    layout.set(child.id, { x: cx, y: childY });

    const start = cx - ((child.referrals.length - 1) * GRANDCHILD_SLOT) / 2;
    child.referrals.forEach((gc, j) => {
      nodes.set(gc.id, {
        user: gc,
        level: "grandchild",
        parentId: child.id,
        relation: `Referred by ${displayName(child)}`,
      });
      layout.set(gc.id, { x: start + j * GRANDCHILD_SLOT, y: grandchildY });
    });
    x += widths[i] + CHILD_GAP;
  });

  return { nodes, layout };
}

// One parent's connectors: a straight stem down from its label, then a bar across its referrals whose
// ends round down into the outer ones, with straight drops to any in between
function connectorPaths(parent: Point, parentLevel: Level, kids: Point[], kidLevel: Level) {
  const top = parent.y + RADIUS[parentLevel] + LABEL[parentLevel];
  const bottom = kids[0].y - RADIUS[kidLevel];
  if (kids.length === 1 && Math.abs(kids[0].x - parent.x) < 1) {
    return [`M ${parent.x} ${top} V ${bottom}`];
  }

  const bar = bottom - DROP;
  const xs = kids.map((k) => k.x).sort((a, b) => a - b);
  const left = xs[0];
  const right = xs[xs.length - 1];
  const r = Math.min(CORNER, (right - left) / 2, DROP);

  return [
    `M ${parent.x} ${top} V ${bar}`,
    `M ${left} ${bottom} V ${bar + r} Q ${left} ${bar} ${left + r} ${bar} H ${right - r} Q ${right} ${bar} ${right} ${bar + r} V ${bottom}`,
    ...xs.slice(1, -1).map((mx) => `M ${mx} ${bar} V ${bottom}`),
  ];
}

// Fits every node (plus room for the empty-state button) inside the viewport, never zooming past 100%
function fitView(positions: Map<string, Point>, width: number, height: number, extraBelow: number): View {
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const minX = Math.min(...xs) - 70;
  const maxX = Math.max(...xs) + 70;
  const minY = Math.min(...ys) - 50;
  const maxY = Math.max(...ys) + 70 + extraBelow;
  const scale = clamp(Math.min(width / (maxX - minX), height / (maxY - minY)), MIN_SCALE, 1);
  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

function Avatar({ user, level, selected }: { user: TreeUser; level: Level; selected?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        avatarSize[level],
        avatarTone[level],
        selected && "ring-2 ring-primary"
      )}
    >
      {user.name ? user.name.charAt(0).toUpperCase() : <Wallet className="w-1/2 h-1/2" />}
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

function DetailsCard({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { user } = node;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the address is still visible to copy by hand
    }
  };

  return (
    <div
      data-ui
      className="absolute inset-x-3 bottom-3 lg:inset-x-auto lg:left-4 lg:bottom-4 lg:w-80 rounded-2xl bg-card p-4 ring-1 ring-primary/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-center gap-3">
        <Avatar user={user} level={node.level === "me" ? "child" : node.level} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{displayName(user)}</p>
          <p className="text-xs text-muted-foreground">{node.relation}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-full bg-secondary px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="truncate font-mono">{user.walletAddress}</span>
        {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
      </button>
    </div>
  );
}

function TreeCanvas({ data, onRefer }: { data: ReferralTreeResponse; onRefer: () => void }) {
  const { nodes, layout } = useMemo(() => buildTree(data), [data]);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Active touches/mouse, for pan and pinch; nodeId remembers what a possible tap started on
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Point; view: View; dist?: number; travelled: number; nodeId?: string } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isEmpty = data.children.length === 0;

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (el) setView(fitView(layout, el.clientWidth, el.clientHeight, isEmpty ? 90 : 0));
  }, [layout, isEmpty]);

  useLayoutEffect(() => {
    setTooltipId(null);
    setSelectedId(null);
    fit();
  }, [fit]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const zoomAt = useCallback((factor: number, at: Point) => {
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
    });
  }, []);

  const zoomFromCentre = (factor: number) => {
    const el = viewportRef.current;
    if (el) zoomAt(factor, { x: el.clientWidth / 2, y: el.clientHeight / 2 });
  };

  // Wheel needs a non-passive listener to stop the page scrolling: ctrl/cmd (and trackpad pinch) zooms, else pans
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTooltipId(null);
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---------- Pan, pinch and tap ----------

  const local = (e: PointerEvent): Point => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startGesture = (nodeId?: string) => {
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = { start: pts[0], view: viewRef.current, travelled: 0, nodeId };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        start: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: viewRef.current,
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        travelled: Infinity, // a pinch is never a tap
      };
    }
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-ui]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    startGesture(target.closest<HTMLElement>("[data-node]")?.dataset.node);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const pts = [...pointers.current.values()];

    if (g.dist && pts.length >= 2) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp(g.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist), MIN_SCALE, MAX_SCALE);
      // Keep the canvas point that was under the fingers' midpoint under it as they move
      const cx = (g.start.x - g.view.x) / g.view.scale;
      const cy = (g.start.y - g.view.y) / g.view.scale;
      setView({ scale, x: mid.x - cx * scale, y: mid.y - cy * scale });
    } else {
      const dx = pts[0].x - g.start.x;
      const dy = pts[0].y - g.start.y;
      g.travelled = Math.max(g.travelled, Math.hypot(dx, dy));
      if (g.travelled >= TAP_SLOP) {
        setTooltipId(null);
        setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
      }
    }
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    // A tap or click on a person toggles their details card; on empty space it closes the card
    if (pointers.current.size === 0 && g && g.travelled < TAP_SLOP) {
      clearTimeout(hoverTimer.current);
      setTooltipId(null);
      setSelectedId((cur) => (g.nodeId && cur !== g.nodeId ? g.nodeId : null));
    }
    if (pointers.current.size > 0) startGesture();
    else gesture.current = null;
  };

  // ---------- Hover tooltip (mouse) ----------

  const onNodeEnter = (id: string) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || gesture.current) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setTooltipId(id), HOVER_DELAY);
  };

  const onNodeLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    setTooltipId(null);
  };

  const me = layout.get(data.me.id)!;
  const tooltip = tooltipId ? nodes.get(tooltipId) : undefined;
  const selected = selectedId ? nodes.get(selectedId) : undefined;
  const tooltipAt = tooltipId ? layout.get(tooltipId) : undefined;

  // Group referrals under their referrer so each parent's lines are drawn together
  const families = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const [id, n] of nodes) {
      if (n.parentId) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), id]);
    }
    return [...byParent];
  }, [nodes]);

  return (
    <div
      ref={viewportRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={(e) => e.key === "Escape" && setSelectedId(null)}
      className={cn(
        "relative overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing",
        // Mobile: full-bleed canvas filling the screen under the header; desktop: a rounded panel
        "-m-4 h-[calc(100dvh-65px)]",
        "lg:m-0 lg:h-[calc(100dvh-10rem)] lg:rounded-3xl lg:border lg:border-border"
      )}
      style={{
        // Dot grid moves and scales with the canvas, so panning visibly moves the surface
        backgroundImage: "radial-gradient(hsl(var(--primary) / 0.12) 1px, transparent 1px)",
        backgroundSize: `${22 * view.scale}px ${22 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
          {families.flatMap(([parentId, kidIds]) => {
            const parent = nodes.get(parentId)!;
            const kidLevel = nodes.get(kidIds[0])!.level;
            return connectorPaths(
              layout.get(parentId)!,
              parent.level,
              kidIds.map((id) => layout.get(id)!),
              kidLevel
            ).map((d, i) => (
              <path
                key={`${parentId}-${i}`}
                d={d}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ));
          })}
        </svg>

        {[...nodes].map(([id, n]) => {
          const p = layout.get(id)!;
          return (
            <button
              key={id}
              type="button"
              data-node={id}
              aria-label={`${displayName(n.user)}, ${n.relation}`}
              aria-describedby={tooltipId === id ? "tree-tooltip" : undefined}
              aria-pressed={selectedId === id}
              // Pointer taps are handled by the canvas; this only catches keyboard activation (Enter/Space)
              onClick={(e) => e.detail === 0 && setSelectedId((cur) => (cur === id ? null : id))}
              onPointerEnter={onNodeEnter(id)}
              onPointerLeave={onNodeLeave}
              onFocus={() => setTooltipId(id)}
              onBlur={() => setTooltipId(null)}
              className="absolute flex w-28 -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
              style={{ left: p.x, top: p.y - RADIUS[n.level] }}
            >
              <Avatar user={n.user} level={n.level} selected={selectedId === id} />
              <span className="max-w-full truncate text-xs font-medium text-foreground">{displayName(n.user)}</span>
              {n.level === "me" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  Me
                </span>
              )}
            </button>
          );
        })}

        {isEmpty && (
          <div
            data-ui
            className="absolute flex w-64 -translate-x-1/2 flex-col items-center"
            style={{ left: me.x, top: me.y + RADIUS.me + LABEL.me + 12 }}
          >
            <p className="text-sm text-muted-foreground mb-3">You haven&apos;t referred anyone yet</p>
            <Button onClick={onRefer} className="rounded-full">
              <UserPlus className="w-4 h-4 mr-2" />
              Refer people
            </Button>
          </div>
        )}
      </div>

      {/* Tooltip lives in screen space so it stays a readable size at any zoom */}
      {tooltip && tooltipAt && (
        <div
          id="tree-tooltip"
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-card px-3 py-2 text-xs ring-1 ring-primary/30 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          style={{
            left: view.x + tooltipAt.x * view.scale,
            top: view.y + (tooltipAt.y - RADIUS[tooltip.level]) * view.scale - 8,
          }}
        >
          <p className="font-semibold text-foreground">{displayName(tooltip.user)}</p>
          <p className="text-muted-foreground">{tooltip.relation}</p>
          <p className="mt-1 font-mono text-[11px] text-primary/80">
            {tooltip.user.walletAddress.slice(0, 6)}...{tooltip.user.walletAddress.slice(-4)}
          </p>
        </div>
      )}

      <div data-ui className="absolute right-3 top-3 flex flex-col gap-2">
        <ControlButton label="Zoom in" onClick={() => zoomFromCentre(1.25)}>
          <Plus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={() => zoomFromCentre(0.8)}>
          <Minus className="h-4 w-4" />
        </ControlButton>
        <ControlButton label="Recentre" onClick={fit}>
          <LocateFixed className="h-4 w-4" />
        </ControlButton>
      </div>

      {selected && <DetailsCard key={selectedId} node={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

export default function ReferralTreePage() {
  const router = useRouter();
  const { data, isLoading } = useReferralTree();

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
        <TreeCanvas data={data} onRefer={() => router.push("/referrals")} />
      )}
    </ResponsiveShell>
  );
}
