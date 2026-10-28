import { act, renderHook } from "@testing-library/react";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useAuth } from "@/contexts/auth-context";
import { useCampaignTransaction } from "@/hooks/use-campaign-transaction";
import type { CampaignCall } from "@/lib/api/campaigns";
import { buildUser } from "../fixtures";

jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
  useConnect: jest.fn(),
  usePublicClient: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock("wagmi/chains", () => ({ hardhat: { id: 31337 } }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock(
  "@reffinity/blockchain-connector/writeReferralContractHelper",
  () => ({
    WriteReferralContractHelper: {
      createCampaignContext: jest
        .fn()
        .mockResolvedValue({ abi: [], address: "0xcontract" }),
    },
  }),
  { virtual: true },
);

const write = jest.fn();
const wait = jest.fn();
const connect = jest.fn();
const switchChain = jest.fn();
const call: CampaignCall = {
  functionName: "createCampaign",
  args: ["0x1234", 1, 1, 0, 30, 10],
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest
    .mocked(useAuth)
    .mockReturnValue({ user: buildUser() } as ReturnType<typeof useAuth>);
  jest.mocked(useAccount).mockReturnValue({
    address: buildUser().walletAddress,
    chainId: 31337,
  } as ReturnType<typeof useAccount>);
  jest.mocked(useConnect).mockReturnValue({
    connectAsync: connect,
    connectors: [{ id: "test" }],
  } as unknown as ReturnType<typeof useConnect>);
  jest
    .mocked(useSwitchChain)
    .mockReturnValue({ switchChainAsync: switchChain } as unknown as ReturnType<
      typeof useSwitchChain
    >);
  jest
    .mocked(useWriteContract)
    .mockReturnValue({ writeContractAsync: write } as unknown as ReturnType<
      typeof useWriteContract
    >);
  jest.mocked(usePublicClient).mockReturnValue({
    waitForTransactionReceipt: wait,
  } as unknown as ReturnType<typeof usePublicClient>);
  write.mockResolvedValue("0xhash");
  wait.mockResolvedValue({ status: "success" });
});

test("sends the API call with bigint rewards and the signed-in account, then waits for a receipt", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({
      account: buildUser().walletAddress,
      chainId: 31337,
      functionName: "createCampaign",
      args: ["0x1234", 1, 1, 0, BigInt(30), BigInt(10)],
    }),
  );
  expect(wait).toHaveBeenCalledWith(
    expect.objectContaining({ hash: "0xhash" }),
  );
  expect(result.current.phase).toBe("syncing");
});

test("reuses the saved hash after remount instead of sending a duplicate transaction", async () => {
  const first = renderHook(useCampaignTransaction);
  await act(() => first.result.current.send(call));
  first.unmount();
  const second = renderHook(useCampaignTransaction);
  await act(() => second.result.current.send(call));
  expect(write).toHaveBeenCalledTimes(1);
  expect(wait).toHaveBeenCalledTimes(2);
});

test("receipt timeouts preserve the transaction for a safe retry", async () => {
  wait.mockRejectedValueOnce(new Error("Timed out waiting for confirmation"));
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(call)).rejects.toThrow("Timed out");
  });
  expect(result.current.busy).toBe(false);
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledTimes(1);
});

test("a reverted transaction can be sent again", async () => {
  wait.mockResolvedValueOnce({ status: "reverted" });
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(call)).rejects.toThrow(
      "transaction failed",
    );
  });
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledTimes(2);
});

test("a different connected wallet cannot send the action", async () => {
  jest.mocked(useAccount).mockReturnValue({
    address: "0xwrong",
    chainId: 31337,
  } as unknown as ReturnType<typeof useAccount>);
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(call)).rejects.toThrow(
      "wallet you used to sign in",
    );
  });
  expect(write).not.toHaveBeenCalled();
});

test("a cancelled replacement is not mistaken for a successful campaign action", async () => {
  wait.mockImplementationOnce(async ({ onReplaced }) => {
    onReplaced({ reason: "cancelled", transaction: { hash: "0xcancelled" } });
    return { status: "success" };
  });
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(call)).rejects.toThrow(
      "cancelled or replaced",
    );
  });
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledTimes(2);
});

test("wallet speed-ups preserve the replacement hash for later receipt checks", async () => {
  wait.mockImplementationOnce(async ({ onReplaced }) => {
    onReplaced({ reason: "repriced", transaction: { hash: "0xfaster" } });
    return { status: "success" };
  });
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(call));
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledTimes(1);
  expect(wait).toHaveBeenLastCalledWith(
    expect.objectContaining({ hash: "0xfaster" }),
  );
});

test("connects a disconnected wallet and switches to the contract network before sending", async () => {
  jest.mocked(useAccount).mockReturnValue({} as ReturnType<typeof useAccount>);
  connect.mockResolvedValue({
    accounts: [buildUser().walletAddress],
    chainId: 1,
  });
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(call));
  expect(connect).toHaveBeenCalled();
  expect(switchChain).toHaveBeenCalledWith({ chainId: 31337 });
  expect(write).toHaveBeenCalledTimes(1);
});

test.each([
  {
    functionName: "submitCampaignFulfillment",
    args: ["0xcampaign", "0xfulfillment"],
  },
  { functionName: "verifyCampaignFulfillment", args: ["0xfulfillment"] },
  { functionName: "rejectCampaignFulfillment", args: ["0xfulfillment"] },
] as CampaignCall[])(
  "sends $functionName with the IDs provided by the API",
  async (action) => {
    const { result } = renderHook(useCampaignTransaction);
    await act(() => result.current.send(action));
    expect(write).toHaveBeenCalledWith(expect.objectContaining(action));
  },
);
