import { act, renderHook } from "@testing-library/react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "viem/actions";
import { useAuth } from "@/contexts/auth-context";
import { useCampaignTransaction } from "@/hooks/use-campaign-transaction";
import { wagmiConfig } from "@/lib/wagmi/config";
import type { CampaignCall } from "@/lib/api/campaigns";
import { buildUser } from "../fixtures";

jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
  useConnect: jest.fn(),
  useSwitchChain: jest.fn(),
  useWriteContract: jest.fn(),
}));
jest.mock("viem/actions", () => ({ waitForTransactionReceipt: jest.fn() }));
jest.mock("@/lib/wagmi/config", () => ({
  wagmiConfig: {
    chains: [{ id: 31337 }, { id: 11155111 }, { id: 1 }],
    getClient: jest.fn().mockReturnValue({ id: "public-client" }),
  },
}));
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
const wait = waitForTransactionReceipt as jest.Mock;
const connect = jest.fn();
const switchChain = jest.fn();
const call: CampaignCall = {
  chainId: 31337,
  contractAddress: "0xcontract",
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
  write.mockResolvedValue("0xhash");
  wait.mockResolvedValue({ status: "success" });
});

test("sends the API call with bigint rewards and the signed-in account, then waits for a receipt", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({
      account: buildUser().walletAddress,
      address: "0xcontract",
      chainId: 31337,
      functionName: "createCampaign",
      args: ["0x1234", 1, 1, 0, BigInt(30), BigInt(10)],
    }),
  );
  expect(wait).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ hash: "0xhash" }),
  );
  expect(result.current.phase).toBe("syncing");
  expect(wagmiConfig.getClient).toHaveBeenCalledWith({ chainId: 31337 });
});

test("sends the API-provided value for a payable public campaign", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(() =>
    result.current.send({
      ...call,
      args: ["0x1234", 1, 1, 1, "30", "10"],
      valueWei: "400",
    }),
  );
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ value: BigInt(400) }),
  );
});

test("sends a private campaign with bigint rewards and its visibility", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(() =>
    result.current.send({
      chainId: 31337,
      contractAddress: "0xcontract",
      functionName: "createCampaignWithVisibility",
      args: ["0x1234", 1, 1, 1, "30", "10", 1],
      valueWei: "400",
    }),
  );
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({
      functionName: "createCampaignWithVisibility",
      args: ["0x1234", 1, 1, 1, BigInt(30), BigInt(10), 1],
      value: BigInt(400),
    }),
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

test("a rejected wallet request is not persisted and can be retried", async () => {
  write.mockRejectedValueOnce(new Error("User rejected the request"));
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(call)).rejects.toThrow("rejected");
  });
  expect(result.current.phase).toBe("idle");
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
  wait.mockImplementationOnce(async (_client, { onReplaced }) => {
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
  wait.mockImplementationOnce(async (_client, { onReplaced }) => {
    onReplaced({ reason: "repriced", transaction: { hash: "0xfaster" } });
    return { status: "success" };
  });
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(call));
  await act(() => result.current.send(call));
  expect(write).toHaveBeenCalledTimes(1);
  expect(wait).toHaveBeenLastCalledWith(
    expect.anything(),
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

test("uses the network in the API descriptor instead of assuming Hardhat", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(() =>
    result.current.send({ ...call, chainId: 11155111 }),
  );
  expect(switchChain).toHaveBeenCalledWith({ chainId: 11155111 });
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ chainId: 11155111 }),
  );
  expect(wagmiConfig.getClient).toHaveBeenCalledWith({ chainId: 11155111 });
});

test("refuses a descriptor for a different or unsupported contract", async () => {
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(
      result.current.send({ ...call, contractAddress: "0xother" }),
    ).rejects.toThrow("does not match");
  });
  await act(async () => {
    await expect(
      result.current.send({ ...call, chainId: 999 }),
    ).rejects.toThrow("unsupported network");
  });
  expect(write).not.toHaveBeenCalled();
});

test("funds a campaign with the prepared value and permits a later top-up", async () => {
  const funding: CampaignCall = {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "fundCampaign",
    args: ["0xcampaign"],
    valueWei: "400",
  };
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(funding));
  await act(() => result.current.send(funding));
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      functionName: "fundCampaign",
      args: ["0xcampaign"],
      value: BigInt(400),
    }),
  );
});

test("a timed-out top-up reuses its hash, then becomes repeatable after confirmation", async () => {
  const funding: CampaignCall = {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "fundCampaign",
    args: ["0xcampaign"],
    valueWei: "400",
  };
  wait.mockRejectedValueOnce(new Error("Timed out waiting for confirmation"));
  const { result } = renderHook(useCampaignTransaction);
  await act(async () => {
    await expect(result.current.send(funding)).rejects.toThrow("Timed out");
  });
  await act(() => result.current.send(funding));
  expect(write).toHaveBeenCalledTimes(1);
  await act(() => result.current.send(funding));
  expect(write).toHaveBeenCalledTimes(2);
});

test("withdraws Direct rewards and permits a later withdrawal", async () => {
  const withdrawal: CampaignCall = {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "withdrawDirectRewards",
    args: [buildUser().walletAddress as `0x${string}`],
  };
  const { result } = renderHook(useCampaignTransaction);
  await act(() => result.current.send(withdrawal));
  await act(() => result.current.send(withdrawal));
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      functionName: "withdrawDirectRewards",
      args: [buildUser().walletAddress],
    }),
  );
});

test.each([
  {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "submitCampaignFulfillment",
    args: ["0xcampaign", "0xfulfillment"],
  },
  {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "verifyCampaignFulfillment",
    args: ["0xfulfillment"],
  },
  {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "rejectCampaignFulfillment",
    args: ["0xfulfillment"],
  },
] as CampaignCall[])(
  "sends $functionName with the IDs provided by the API",
  async (action) => {
    const { result } = renderHook(useCampaignTransaction);
    await act(() => result.current.send(action));
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: action.functionName,
        args: action.args,
      }),
    );
  },
);
