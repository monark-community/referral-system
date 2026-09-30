// Purpose: Tests for onboarding step 1 - connecting MetaMask, signing in, and registering new users on-chain
// Notes:
// - wagmi, the contract helper, and walletAuth are mocked so the step's decisions can be checked without a wallet
// - The blockchain connector only publishes ESM "import" exports, so its mock is virtual

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { WalletConnectStep } from "@/components/onboarding/steps/wallet-connect-step";
import { walletAuth, type AuthResponse } from "@/lib/api/auth";
import { useAuth } from "@/contexts/auth-context";
import { buildUser } from "../../fixtures";

jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
  useConnect: jest.fn(),
  useDisconnect: jest.fn(),
  useSignMessage: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
  useSimulateContract: jest.fn(),
}));
jest.mock("wagmi/chains", () => ({ hardhat: { id: 31337 } }));
jest.mock("@wagmi/core", () => ({ waitForTransactionReceipt: jest.fn() }));
jest.mock("viem", () => ({ stringToHex: jest.fn() }));
jest.mock("@/lib/wagmi/config", () => ({ wagmiConfig: {} }));
jest.mock(
  "@reffinity/blockchain-connector/writeReferralContractHelper",
  () => ({
    WriteReferralContractHelper: {
      acceptInviteContext: jest.fn().mockResolvedValue({ functionName: "acceptInvite" }),
      joinProgramContext: jest.fn().mockResolvedValue({ functionName: "joinProgram" }),
    },
  }),
  { virtual: true },
);
jest.mock("@/lib/api/auth", () => ({ walletAuth: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const walletAddress = "0x1111111111111111111111111111111111111111";
const metaMaskConnector = { id: "metaMask", name: "MetaMask" };

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockSignMessageAsync = jest.fn();
const mockSwitchChainAsync = jest.fn();
const mockWriteContractAsync = jest.fn();
const mockLogin = jest.fn();

function mockWallet({ connected = true, connectors = [metaMaskConnector] } = {}) {
  jest.mocked(useAccount).mockReturnValue({
    address: connected ? walletAddress : undefined,
    isConnected: connected,
  } as unknown as ReturnType<typeof useAccount>);
  jest.mocked(useConnect).mockReturnValue({
    connectors,
    connect: mockConnect,
    isPending: false,
  } as unknown as ReturnType<typeof useConnect>);
}

function mockAuthResponse(overrides: Partial<AuthResponse>) {
  jest.mocked(walletAuth).mockResolvedValue({
    user: buildUser(),
    token: "jwt-123",
    isNewUser: true,
    ...overrides,
  });
}

function renderStep() {
  const props = {
    onSuccess: jest.fn(),
    onReturningUser: jest.fn(),
    onNeedsVerification: jest.fn(),
  };
  render(<WalletConnectStep {...props} />);
  return props;
}

beforeEach(() => {
  jest.mocked(useDisconnect).mockReturnValue({ disconnect: mockDisconnect } as unknown as ReturnType<typeof useDisconnect>);
  jest.mocked(useSignMessage).mockReturnValue({ signMessageAsync: mockSignMessageAsync } as unknown as ReturnType<typeof useSignMessage>);
  jest.mocked(useSwitchChain).mockReturnValue({ switchChainAsync: mockSwitchChainAsync } as unknown as ReturnType<typeof useSwitchChain>);
  jest.mocked(useWriteContract).mockReturnValue({ writeContractAsync: mockWriteContractAsync } as unknown as ReturnType<typeof useWriteContract>);
  jest.mocked(useAuth).mockReturnValue({ login: mockLogin } as unknown as ReturnType<typeof useAuth>);
  mockSignMessageAsync.mockResolvedValue("0xsignature");
  mockWriteContractAsync.mockResolvedValue("0xtxhash");
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("before the wallet is connected", () => {
  test("connects through the MetaMask connector", async () => {
    mockWallet({ connected: false });
    renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));

    expect(mockConnect).toHaveBeenCalledWith({ connector: metaMaskConnector });
  });

  test("explains how to get MetaMask when it is not installed", async () => {
    mockWallet({ connected: false, connectors: [] });
    renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Connect MetaMask" }));

    expect(screen.getByRole("alert")).toHaveTextContent("MetaMask is not available");
    expect(screen.getByRole("link", { name: "Install it here" })).toHaveAttribute(
      "href",
      "https://metamask.io/download/",
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("after the wallet is connected", () => {
  test("shows the shortened address and can disconnect", async () => {
    mockWallet();
    renderStep();

    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  test("signs in with the stored invite codes and then clears them", async () => {
    mockWallet();
    mockAuthResponse({ isNewUser: false });
    localStorage.setItem("referralCode", "BOB1234567");
    localStorage.setItem("inviteCode", "INV12345");
    renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    const message = mockSignMessageAsync.mock.calls[0][0].message;
    expect(message).toContain(`Wallet: ${walletAddress}`);
    expect(walletAuth).toHaveBeenCalledWith(walletAddress, "0xsignature", message, "BOB1234567", "INV12345");
    expect(localStorage.getItem("referralCode")).toBeNull();
    expect(localStorage.getItem("inviteCode")).toBeNull();
  });

  test("logs a returning user straight in without touching the contract", async () => {
    mockWallet();
    const user = buildUser({ name: "Alice", emailVerified: true });
    mockAuthResponse({ isNewUser: false, user });
    const { onReturningUser, onSuccess } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(mockLogin).toHaveBeenCalledWith("jwt-123", user);
    expect(onReturningUser).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  test("sends a returning user with an unverified email to verification", async () => {
    mockWallet();
    mockAuthResponse({ isNewUser: false, user: buildUser({ emailVerified: false }) });
    const { onReturningUser, onNeedsVerification } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(onNeedsVerification).toHaveBeenCalledTimes(1);
    expect(onReturningUser).not.toHaveBeenCalled();
  });

  test("registers a referred user by accepting the invite on-chain before logging in", async () => {
    mockWallet();
    const referrer = "0x2222222222222222222222222222222222222222";
    mockAuthResponse({ referrerWalletAddress: referrer, bytesInviteId: "0xinvite" });
    const { onSuccess } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 31337 });
    expect(mockWriteContractAsync).toHaveBeenCalledWith({
      functionName: "acceptInvite",
      chainId: 31337,
      args: [referrer, "0xinvite"],
    });
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({}, { hash: "0xtxhash" });
    expect(mockLogin).toHaveBeenCalledWith("jwt-123", expect.anything());
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("registers a user without a referrer by joining the program", async () => {
    mockWallet();
    mockAuthResponse({});
    const { onSuccess } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(mockWriteContractAsync).toHaveBeenCalledWith({
      functionName: "joinProgram",
      chainId: 31337,
      args: [],
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test("does not log in a referred user whose invite id is missing", async () => {
    mockWallet();
    mockAuthResponse({ referrerWalletAddress: "0x2222222222222222222222222222222222222222" });
    const { onSuccess } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invite ID is missing for referred user");
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("does not log in when the registration transaction fails", async () => {
    mockWallet();
    mockAuthResponse({});
    mockWriteContractAsync.mockRejectedValue(new Error("Referree already in system"));
    const { onSuccess } = renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Referree already in system");
    expect(mockLogin).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test("shows a friendly message when the signature is rejected", async () => {
    mockWallet();
    mockSignMessageAsync.mockRejectedValue(new Error("User rejected the request."));
    renderStep();

    await userEvent.click(screen.getByRole("button", { name: "Sign & Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Signature request was rejected. Please try again.",
    );
    expect(walletAuth).not.toHaveBeenCalled();
  });
});
