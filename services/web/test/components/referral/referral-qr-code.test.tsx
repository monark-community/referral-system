// Purpose: Tests for the referral QR code popup - opening, rendering the code, and closing

import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferralQRCode } from "@/components/referral/referral-qr-code";

const referralLink = "http://localhost:3000/invite/ALICE12345";

test("opens a popup with a QR code for the referral link", async () => {
  const user = userEvent.setup();
  const { container } = render(<ReferralQRCode referralLink={referralLink} />);
  expect(screen.queryByText("Your QR Code")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Show QR Code" }));

  expect(screen.getByText("Your QR Code")).toBeInTheDocument();
  expect(container.querySelector("svg#referral-qr-code")).toBeInTheDocument();
});

test("closes from the close button", async () => {
  const user = userEvent.setup();
  render(<ReferralQRCode referralLink={referralLink} />);
  await user.click(screen.getByRole("button", { name: "Show QR Code" }));

  await user.click(screen.getByRole("button", { name: "Close" }));

  await waitForElementToBeRemoved(() => screen.queryByText("Your QR Code"));
});

test("closes when Escape is pressed", async () => {
  const user = userEvent.setup();
  render(<ReferralQRCode referralLink={referralLink} />);
  await user.click(screen.getByRole("button", { name: "Show QR Code" }));

  await user.keyboard("{Escape}");

  await waitForElementToBeRemoved(() => screen.queryByText("Your QR Code"));
});
