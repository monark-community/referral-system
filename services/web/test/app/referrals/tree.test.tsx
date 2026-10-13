// Purpose: Tests for the referral tree page - who is shown and how they relate, the details card, tooltips, and moving around the canvas
// Notes:
// - The data hook is mocked so each test controls exactly which tree the page receives
// - The layout shell is stubbed; it is covered by the sidebar tests
// - jsdom has no layout or pointer capture, so the canvas is given a fixed size and setPointerCapture is stubbed
// - jsdom has no PointerEvent either, so drags, pinches and hovers are sent as mouse events that carry the pointer fields the page reads

import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferralTreePage from "@/app/referrals/tree/page";
import { useReferralTree } from "@/lib/api/hooks";
import type { ReferralTreeResponse, TreeUser } from "@/lib/api/user";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/api/hooks", () => ({ useReferralTree: jest.fn() }));

const WINDOW = { width: 1000, height: 800 };

const person = (id: string, name: string | null, walletDigit: string): TreeUser => ({
  id,
  name,
  walletAddress: `0x${walletDigit.repeat(40)}`,
});

// Grace referred Paul, who referred Alice (the user).
// Alice referred Bob and Dana; Bob referred Carol, Dave and Erin, and Dana referred Frank.
const grace = person("grace", "Grace", "9");
const paul = person("paul", "Paul", "8");
const alice = person("alice", "Alice", "1");
const bob = person("bob", "Bob", "2");
const dana = person("dana", "Dana", "3");
const carol = person("carol", "Carol", "4");
const dave = person("dave", "Dave", "5");
const erin = person("erin", "Erin", "6");
const frank = person("frank", "Frank", "7");

const fullTree: ReferralTreeResponse = {
  me: alice,
  parent: paul,
  grandparent: grace,
  children: [
    { ...bob, referrals: [carol, dave, erin] },
    { ...dana, referrals: [frank] },
  ],
};

// Alice joined without an invite and has not referred anyone
const lonelyTree: ReferralTreeResponse = { me: alice, parent: null, grandparent: null, children: [] };

function renderPage({ tree = fullTree, loading = false }: { tree?: ReferralTreeResponse; loading?: boolean } = {}) {
  jest.mocked(useReferralTree).mockReturnValue({
    data: loading ? undefined : tree,
    isLoading: loading,
  } as unknown as ReturnType<typeof useReferralTree>);
  render(<ReferralTreePage />);
}

// Each person is a button labelled "<name>, <how they relate to the user>"
const personButton = (label: string) => screen.getByRole("button", { name: label });
const walletButton = (user: TreeUser) => screen.queryByRole("button", { name: user.walletAddress });

// The layer that moves and scales: every person sits directly inside it
const canvas = () => personButton("Alice, You").parentElement as HTMLElement;
// The fixed window the canvas moves inside, which also receives drags, pinches and scrolling
const viewport = () => canvas().parentElement as HTMLElement;

// How far the canvas has been moved and scaled inside the window
function view() {
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(canvas().style.transform);
  if (!match) throw new Error(`Unexpected canvas transform: "${canvas().style.transform}"`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

// Where a person is drawn on the canvas, before the canvas is moved or scaled
function position(label: string) {
  const { left, top } = personButton(label).style;
  return { x: parseFloat(left), y: parseFloat(top) };
}

// The canvas point currently shown at a given spot in the window
function canvasPointAt(windowX: number, windowY: number) {
  const { x, y, scale } = view();
  return { x: (windowX - x) / scale, y: (windowY - y) / scale };
}

type PointerInit = { pointerId?: number; pointerType?: "mouse" | "touch"; clientX?: number; clientY?: number };

function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointerover" | "pointerout",
  target: Element,
  { pointerId = 1, pointerType = "mouse", clientX = 0, clientY = 0 }: PointerInit = {},
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.assign(event, { pointerId, pointerType });
  fireEvent(target, event);
}

function drag(target: Element, from: [number, number], to: [number, number]) {
  pointer("pointerdown", target, { clientX: from[0], clientY: from[1] });
  pointer("pointermove", target, { clientX: to[0], clientY: to[1] });
  pointer("pointerup", target, { clientX: to[0], clientY: to[1] });
}

beforeAll(() => {
  // jsdom reports every element as 0x0, which would squeeze any tree down to the minimum zoom
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: WINDOW.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: WINDOW.height });
  HTMLElement.prototype.setPointerCapture = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ---------- Who is shown ----------

test("shows a spinner while the tree is loading", () => {
  renderPage({ loading: true });

  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Alice, You" })).not.toBeInTheDocument();
});

test("shows the user, the two people above them, and two levels of referrals below", () => {
  renderPage();

  expect(personButton("Grace, Referred Paul")).toBeInTheDocument();
  expect(personButton("Paul, Referred you")).toBeInTheDocument();
  expect(personButton("Alice, You")).toBeInTheDocument();
  expect(personButton("Bob, You referred them")).toBeInTheDocument();
  expect(personButton("Dana, You referred them")).toBeInTheDocument();
  expect(personButton("Carol, Referred by Bob")).toBeInTheDocument();
  expect(personButton("Dave, Referred by Bob")).toBeInTheDocument();
  expect(personButton("Erin, Referred by Bob")).toBeInTheDocument();
  expect(personButton("Frank, Referred by Dana")).toBeInTheDocument();
});

test("tags only the user as Me", () => {
  renderPage();

  expect(personButton("Alice, You")).toHaveTextContent("Me");
  expect(personButton("Paul, Referred you")).not.toHaveTextContent("Me");
  expect(personButton("Bob, You referred them")).not.toHaveTextContent("Me");
});

test("shows a shortened wallet address and a wallet icon for someone without a name", () => {
  const unnamed: TreeUser = { id: "zed", name: null, walletAddress: "0xAbCdEf0000000000000000000000000000001234" };
  renderPage({ tree: { ...lonelyTree, children: [{ ...unnamed, referrals: [carol] }] } });

  const button = personButton("0xAbCd...1234, You referred them");
  expect(button).toHaveTextContent("0xAbCd...1234");
  expect(button.querySelector("svg")).toBeInTheDocument();
  // Someone with a name gets their initial instead of the icon
  expect(personButton("Alice, You").querySelector("svg")).not.toBeInTheDocument();
  // The people they referred are described by the same short address
  expect(personButton("Carol, Referred by 0xAbCd...1234")).toBeInTheDocument();
});

test("invites a user with no referrals to refer people", async () => {
  renderPage({ tree: lonelyTree });

  expect(screen.getByText("You haven't referred anyone yet")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Refer people" }));

  expect(mockPush).toHaveBeenCalledWith("/referrals");
});

test("does not show the refer prompt once the user has referrals", () => {
  renderPage();

  expect(screen.queryByText("You haven't referred anyone yet")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refer people" })).not.toBeInTheDocument();
});

// ---------- Layout ----------

test("stacks the generations from top to bottom", () => {
  renderPage();

  const rows = [
    "Grace, Referred Paul",
    "Paul, Referred you",
    "Alice, You",
    "Bob, You referred them",
    "Carol, Referred by Bob",
  ].map((label) => position(label).y);

  expect(rows).toEqual([...rows].sort((a, b) => a - b));
  expect(new Set(rows).size).toBe(rows.length);
  // People in the same generation share a row
  expect(position("Dana, You referred them").y).toBe(position("Bob, You referred them").y);
  expect(position("Frank, Referred by Dana").y).toBe(position("Carol, Referred by Bob").y);
});

test("centres each person over the people they referred", () => {
  renderPage();
  const x = (label: string) => position(label).x;

  // Bob sits over the middle one of his three referrals, which are evenly spaced
  expect(x("Bob, You referred them")).toBe(x("Dave, Referred by Bob"));
  expect(x("Dave, Referred by Bob") - x("Carol, Referred by Bob")).toBe(
    x("Erin, Referred by Bob") - x("Dave, Referred by Bob"),
  );
  // Dana's only referral is directly below her, clear of Bob's
  expect(x("Dana, You referred them")).toBe(x("Frank, Referred by Dana"));
  expect(x("Frank, Referred by Dana")).toBeGreaterThan(x("Erin, Referred by Bob"));
  // The people above the user share the user's centre line
  expect(x("Paul, Referred you")).toBe(x("Alice, You"));
  expect(x("Grace, Referred Paul")).toBe(x("Alice, You"));
});

test("spreads the user's referrals evenly on both sides of them", () => {
  const children = [bob, dana, erin].map((child) => ({ ...child, referrals: [] }));
  renderPage({ tree: { ...lonelyTree, children } });
  const x = (label: string) => position(label).x;

  expect(x("Dana, You referred them")).toBe(x("Alice, You"));
  expect(x("Bob, You referred them")).toBeLessThan(x("Alice, You"));
  expect(x("Alice, You") - x("Bob, You referred them")).toBe(x("Erin, You referred them") - x("Alice, You"));
});

test("draws a line from every person to the people they referred", () => {
  renderPage();

  const lines = canvas().querySelector("svg")!.querySelectorAll("path");

  // Grace to Paul, Paul to Alice and Dana to Frank are one straight line each.
  // Alice's two referrals take a stem and a bar; Bob's three add a drop to the middle one.
  expect(lines).toHaveLength(1 + 1 + 1 + 2 + 3);
});

test("opens with the whole tree in the window, zooming out for a wide one", () => {
  const children = Array.from({ length: 12 }, (_, i) => ({ ...person(`child-${i}`, `Child ${i}`, "a"), referrals: [] }));
  renderPage({ tree: { ...lonelyTree, children } });

  const { x, y, scale } = view();
  expect(scale).toBeLessThan(1);
  for (const label of ["Alice, You", ...children.map((child) => `${child.name}, You referred them`)]) {
    const at = position(label);
    expect(x + at.x * scale).toBeGreaterThan(0);
    expect(x + at.x * scale).toBeLessThan(WINDOW.width);
    expect(y + at.y * scale).toBeGreaterThan(0);
    expect(y + at.y * scale).toBeLessThan(WINDOW.height);
  }
});

test("does not zoom in past 100% to fill the window with a small tree", () => {
  renderPage({ tree: lonelyTree });

  expect(view().scale).toBe(1);
});

// ---------- Details card ----------

test("clicking a person opens a card with how they relate to the user and their full wallet address", async () => {
  renderPage();

  await userEvent.click(personButton("Bob, You referred them"));

  expect(personButton("Bob, You referred them")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("You referred them")).toBeInTheDocument();
  expect(walletButton(bob)).toBeInTheDocument();
});

test("clicking the same person again closes their card", async () => {
  renderPage();

  await userEvent.click(personButton("Bob, You referred them"));
  await userEvent.click(personButton("Bob, You referred them"));

  expect(walletButton(bob)).not.toBeInTheDocument();
  expect(personButton("Bob, You referred them")).toHaveAttribute("aria-pressed", "false");
});

test("clicking someone else moves the card to them", async () => {
  renderPage();

  await userEvent.click(personButton("Bob, You referred them"));
  await userEvent.click(personButton("Carol, Referred by Bob"));

  expect(walletButton(bob)).not.toBeInTheDocument();
  expect(walletButton(carol)).toBeInTheDocument();
  expect(screen.getByText("Referred by Bob")).toBeInTheDocument();
});

test("the card closes from its close button", async () => {
  renderPage();
  await userEvent.click(personButton("Bob, You referred them"));

  await userEvent.click(screen.getByRole("button", { name: "Close" }));

  expect(walletButton(bob)).not.toBeInTheDocument();
});

test("the card closes on Escape", async () => {
  renderPage();
  await userEvent.click(personButton("Bob, You referred them"));

  await userEvent.keyboard("{Escape}");

  expect(walletButton(bob)).not.toBeInTheDocument();
});

test("the card closes when the empty canvas is clicked", async () => {
  renderPage();
  await userEvent.click(personButton("Bob, You referred them"));

  await userEvent.click(viewport());

  expect(walletButton(bob)).not.toBeInTheDocument();
});

test("the card copies the wallet address", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(personButton("Bob, You referred them"));

  await user.click(walletButton(bob)!);

  await expect(navigator.clipboard.readText()).resolves.toBe(bob.walletAddress);
});

test("a blocked clipboard leaves the card open with the address still readable", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(personButton("Bob, You referred them"));
  jest.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("blocked"));

  await user.click(walletButton(bob)!);

  expect(walletButton(bob)).toBeInTheDocument();
});

test("a person can be opened and closed from the keyboard", async () => {
  renderPage();
  act(() => personButton("Bob, You referred them").focus());

  await userEvent.keyboard("{Enter}");
  expect(walletButton(bob)).toBeInTheDocument();

  await userEvent.keyboard("{Enter}");
  expect(walletButton(bob)).not.toBeInTheDocument();
});

// ---------- Tooltips ----------

test("focusing a person shows a tooltip with who they are, and leaving hides it", () => {
  renderPage();
  const carolButton = personButton("Carol, Referred by Bob");

  act(() => carolButton.focus());

  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("Carol");
  expect(tooltip).toHaveTextContent("Referred by Bob");
  expect(tooltip).toHaveTextContent("0x4444...4444");
  expect(carolButton).toHaveAttribute("aria-describedby", tooltip.id);

  act(() => carolButton.blur());

  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("resting the mouse on a person for half a second shows their tooltip", () => {
  jest.useFakeTimers();
  renderPage();
  const carolButton = personButton("Carol, Referred by Bob");

  pointer("pointerover", carolButton);
  act(() => {
    jest.advanceTimersByTime(499);
  });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(screen.getByRole("tooltip")).toHaveTextContent("Carol");

  pointer("pointerout", carolButton);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("passing the mouse over a person without stopping shows no tooltip", () => {
  jest.useFakeTimers();
  renderPage();
  const carolButton = personButton("Carol, Referred by Bob");

  pointer("pointerover", carolButton);
  act(() => {
    jest.advanceTimersByTime(300);
  });
  pointer("pointerout", carolButton);
  act(() => {
    jest.advanceTimersByTime(1000);
  });

  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("a finger resting on a person does not open the hover tooltip", () => {
  jest.useFakeTimers();
  renderPage();

  pointer("pointerover", personButton("Carol, Referred by Bob"), { pointerType: "touch" });
  act(() => {
    jest.advanceTimersByTime(1000);
  });

  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

// ---------- Moving around the canvas ----------

test("dragging the canvas moves the tree with the pointer", () => {
  renderPage();
  const before = view();

  drag(viewport(), [300, 300], [360, 340]);

  expect(view()).toEqual({ x: before.x + 60, y: before.y + 40, scale: before.scale });
});

test("a drag that starts on a person moves the tree without opening their card", () => {
  renderPage();
  const before = view();

  drag(personButton("Bob, You referred them"), [300, 300], [330, 300]);

  expect(view().x).toBe(before.x + 30);
  expect(walletButton(bob)).not.toBeInTheDocument();
});

test("a press that barely moves counts as a click, not a drag", () => {
  renderPage();
  const before = view();

  drag(personButton("Bob, You referred them"), [300, 300], [302, 301]);

  expect(view()).toEqual(before);
  expect(walletButton(bob)).toBeInTheDocument();
});

test("the zoom buttons scale the tree in steps and stop at 200% and 40%", async () => {
  renderPage();
  expect(view().scale).toBe(1);

  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(view().scale).toBeCloseTo(1.25);

  for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(view().scale).toBe(2);

  for (let i = 0; i < 10; i++) await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  expect(view().scale).toBe(0.4);
});

test("the zoom buttons keep the middle of the window in place", async () => {
  renderPage();
  const middle = () => canvasPointAt(WINDOW.width / 2, WINDOW.height / 2);
  const before = middle();

  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));

  expect(middle().x).toBeCloseTo(before.x);
  expect(middle().y).toBeCloseTo(before.y);
});

test("Recentre brings a moved and zoomed tree back to how it opened", async () => {
  renderPage();
  const opened = view();
  drag(viewport(), [300, 300], [520, 410]);
  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(view()).not.toEqual(opened);

  await userEvent.click(screen.getByRole("button", { name: "Recentre" }));

  expect(view()).toEqual(opened);
});

test("pinching two fingers apart zooms in, and together zooms out", () => {
  renderPage();
  const finger = (type: "pointerdown" | "pointermove" | "pointerup", pointerId: number, clientX: number) =>
    pointer(type, viewport(), { pointerId, pointerType: "touch", clientX, clientY: 400 });

  finger("pointerdown", 1, 400);
  finger("pointerdown", 2, 600);
  finger("pointermove", 2, 800); // twice as far apart as they started
  expect(view().scale).toBe(2);

  finger("pointermove", 2, 500); // half as far apart as they started
  expect(view().scale).toBe(0.5);

  finger("pointerup", 2, 500);
  finger("pointerup", 1, 400);
});

test("a plain scroll pans the tree instead of scrolling the page", () => {
  renderPage();
  const before = view();

  const pageWouldScroll = fireEvent.wheel(viewport(), { deltaX: 30, deltaY: 40 });

  expect(pageWouldScroll).toBe(false);
  expect(view()).toEqual({ x: before.x - 30, y: before.y - 40, scale: before.scale });
});

test("ctrl + scroll zooms in and out around the pointer", () => {
  renderPage();
  const underPointer = () => canvasPointAt(700, 250);
  const before = underPointer();

  fireEvent.wheel(viewport(), { deltaY: -40, ctrlKey: true, clientX: 700, clientY: 250 });
  const zoomedIn = view().scale;
  expect(zoomedIn).toBeGreaterThan(1);
  expect(underPointer().x).toBeCloseTo(before.x);
  expect(underPointer().y).toBeCloseTo(before.y);

  fireEvent.wheel(viewport(), { deltaY: 40, ctrlKey: true, clientX: 700, clientY: 250 });
  expect(view().scale).toBeLessThan(zoomedIn);
});
