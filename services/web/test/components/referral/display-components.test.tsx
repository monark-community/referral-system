// Purpose: Tests for the small referral display components - PointsCard, NavMenuItem, and PageHeader

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PointsCard } from "@/components/referral/points-card";
import { NavMenuItem } from "@/components/referral/nav-menu-item";
import { PageHeader } from "@/components/referral/page-header";

describe("PointsCard", () => {
  test("shows the label and the formatted points", () => {
    render(<PointsCard label="Earned" points={15000} variant="earned" />);

    expect(screen.getByText("15,000")).toBeInTheDocument();
    expect(screen.getByText("Earned")).toBeInTheDocument();
  });
});

describe("NavMenuItem", () => {
  test("renders a button that calls onClick", async () => {
    const onClick = jest.fn();
    render(<NavMenuItem label="Rewards" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "Rewards" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("renders a link when given an href", () => {
    render(<NavMenuItem label="Rewards" href="/referrals/rewards" />);

    expect(screen.getByRole("link", { name: "Rewards" })).toHaveAttribute("href", "/referrals/rewards");
  });

  test.each([
    [3, "3"],
    [150, "99+"],
  ])("shows a badge of %d as %s", (badge, expected) => {
    render(<NavMenuItem label="Invites History" badge={badge} />);

    expect(screen.getByRole("button")).toHaveTextContent(`Invites History${expected}`);
  });

  test("hides the badge when the count is zero", () => {
    render(<NavMenuItem label="Invites History" badge={0} />);

    expect(screen.getByRole("button")).toHaveTextContent(/^Invites History$/);
  });
});

describe("PageHeader", () => {
  test("shows the title and subtitle", () => {
    render(<PageHeader title="My Profile" subtitle="Referrals Program" />);

    expect(screen.getByRole("heading", { name: "My Profile" })).toBeInTheDocument();
    expect(screen.getByText("Referrals Program")).toBeInTheDocument();
  });

  test("only shows the back and close buttons that have handlers", async () => {
    const onBack = jest.fn();
    render(<PageHeader title="My Profile" onBack={onBack} />);

    await userEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  test("calls onClose from the close button", async () => {
    const onClose = jest.fn();
    render(<PageHeader title="My Profile" onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
  });
});
