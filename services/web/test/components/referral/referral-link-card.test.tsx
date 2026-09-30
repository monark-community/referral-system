// Purpose: Tests for the mobile referral link card - copying the link and sharing public or private invite links
// Notes:
// - A private share also registers the invite on-chain, so wagmi and the contract helper are mocked
// - The blockchain connector only publishes ESM "import" exports, so its mock is virtual

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWriteContract } from "wagmi";
import { ReferralLinkCard } from "@/components/referral/referral-link-card";
import { createPrivateInvite } from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";

jest.mock("wagmi", () => ({ useWriteContract: jest.fn() }));
jest.mock("wagmi/chains", () => ({ hardhat: { id: 31337 } }));
jest.mock(
  "@reffinity/blockchain-connector/writeReferralContractHelper",
  () => ({
    WriteReferralContractHelper: {
      createInviteContext: jest.fn().mockResolvedValue({ functionName: "createInvite" }),
    },
  }),
  { virtual: true },
);
jest.mock("@/lib/api/user", () => ({ createPrivateInvite: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/components/referral/referral-qr-code", () => ({ ReferralQRCode: () => null }));

const referralLink = "http://localhost:3000/invite/ALICE12345";
const privateInvite = {
  bytesinviteId: "0xinvite",
  referralCode: "ALICE12345",
  inviteCode: "INV12345",
  referrerWallet: "0x1111111111111111111111111111111111111111",
};

const mockWriteContractAsync = jest.fn();
const mockRefreshUser = jest.fn();
const mockShare = jest.fn();

function renderCard() {
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, "invalidateQueries");
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ReferralLinkCard referralLink={referralLink} />
    </QueryClientProvider>,
  );
  return { user, queryClient };
}

beforeEach(() => {
  jest.mocked(useWriteContract).mockReturnValue({
    writeContractAsync: mockWriteContractAsync,
  } as unknown as ReturnType<typeof useWriteContract>);
  jest.mocked(useAuth).mockReturnValue({ refreshUser: mockRefreshUser } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(createPrivateInvite).mockResolvedValue(privateInvite);
  Object.defineProperty(navigator, "share", { value: mockShare, configurable: true });
  mockShare.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
  delete (navigator as { share?: unknown }).share;
});

test("shows the referral link and copies it to the clipboard", async () => {
  const { user } = renderCard();
  expect(screen.getByDisplayValue(referralLink)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Copy link" }));

  await expect(navigator.clipboard.readText()).resolves.toBe(referralLink);
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

test("Share creates a private invite and offers public and private links", async () => {
  const { user } = renderCard();

  await user.click(screen.getByRole("button", { name: "Share" }));

  expect(createPrivateInvite).toHaveBeenCalledWith(null);
  expect(screen.getByRole("button", { name: "Public Link" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Private Link" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
});

test("sharing the public link does not touch the contract", async () => {
  const { user } = renderCard();
  await user.click(screen.getByRole("button", { name: "Share" }));

  await user.click(screen.getByRole("button", { name: "Public Link" }));

  expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ url: referralLink }));
  expect(mockWriteContractAsync).not.toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Share" })).toBeInTheDocument();
});

test("sharing the private link registers the invite on-chain and refreshes invites", async () => {
  const { user, queryClient } = renderCard();
  await user.click(screen.getByRole("button", { name: "Share" }));

  await user.click(screen.getByRole("button", { name: "Private Link" }));

  expect(mockShare).toHaveBeenCalledWith(
    expect.objectContaining({ url: `${referralLink}-INV12345` }),
  );
  await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  expect(mockWriteContractAsync).toHaveBeenCalledWith({
    functionName: "createInvite",
    chainId: 31337,
    args: ["0xinvite", privateInvite.referrerWallet, 0],
  });
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["invites"] });
});

test("falls back to an alert when the browser cannot share", async () => {
  delete (navigator as { share?: unknown }).share;
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  const { user } = renderCard();
  await user.click(screen.getByRole("button", { name: "Share" }));

  await user.click(screen.getByRole("button", { name: "Public Link" }));

  expect(alertSpy).toHaveBeenCalledWith(`Share link: ${referralLink}`);
  alertSpy.mockRestore();
});

test("keeps the Share button when the private invite cannot be created", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(createPrivateInvite).mockRejectedValue(new Error("Account disabled"));
  const { user } = renderCard();

  await user.click(screen.getByRole("button", { name: "Share" }));

  expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Public Link" })).not.toBeInTheDocument();
  jest.mocked(console.error).mockRestore();
});
