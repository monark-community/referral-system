"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { hardhat } from "wagmi/chains";
import { WriteReferralContractHelper } from "@reffinity/blockchain-connector/writeReferralContractHelper";
import { useAuth } from "@/contexts/auth-context";
import type { CampaignCall } from "@/lib/api/campaigns";

export function campaignError(error: unknown): string {
  if (error instanceof Error) {
    if (/rejected|denied/i.test(error.message))
      return "The wallet request was declined. Your progress is saved; you can try again.";
    return (
      (error as Error & { shortMessage?: string }).shortMessage || error.message
    );
  }
  return "Something went wrong. Please try again.";
}

// Keep hashes across navigation/reloads so a delayed listener never causes a second send.
export function useCampaignTransaction() {
  const { user } = useAuth();
  const { address, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: hardhat.id });
  const [phase, setPhase] = useState<
    "idle" | "wallet" | "confirming" | "syncing"
  >("idle");

  async function send(call: CampaignCall) {
    if (!user || !client)
      throw new Error("Please sign in and connect your wallet.");
    const context = await WriteReferralContractHelper.createCampaignContext();
    const storageKey = `campaign-tx:${hardhat.id}:${context.address}:${user.id}:${call.functionName}:${call.args[0]}`;
    let hash = localStorage.getItem(storageKey) as `0x${string}` | null;
    try {
      if (!hash) {
        setPhase("wallet");
        let wallet = address;
        let network = chainId;
        if (!wallet) {
          const connector = connectors[0];
          if (!connector)
            throw new Error("Install MetaMask to continue with your wallet.");
          const connection = await connectAsync({ connector });
          wallet = connection.accounts[0];
          network = connection.chainId;
        }
        if (wallet?.toLowerCase() !== user.walletAddress.toLowerCase()) {
          throw new Error(
            "Switch to the wallet you used to sign in, then try again.",
          );
        }
        if (network !== hardhat.id)
          await switchChainAsync({ chainId: hardhat.id });
        const base = {
          abi: context.abi,
          address: context.address,
          chainId: hardhat.id,
          account: wallet,
        } as const;
        switch (call.functionName) {
          case "createCampaign": {
            const [id, task, verification, reward, points, pool] = call.args;
            hash = await writeContractAsync({
              ...base,
              functionName: call.functionName,
              args: [
                id,
                task,
                verification,
                reward,
                BigInt(points),
                BigInt(pool),
              ],
            });
            break;
          }
          case "createCampaignWithVisibility": {
            const [id, task, verification, reward, points, pool, visibility] =
              call.args;
            hash = await writeContractAsync({
              ...base,
              functionName: call.functionName,
              args: [
                id,
                task,
                verification,
                reward,
                BigInt(points),
                BigInt(pool),
                visibility,
              ],
            });
            break;
          }
          case "submitCampaignFulfillment":
            hash = await writeContractAsync({
              ...base,
              functionName: call.functionName,
              args: call.args,
            });
            break;
          case "verifyCampaignFulfillment":
          case "rejectCampaignFulfillment":
            hash = await writeContractAsync({
              ...base,
              functionName: call.functionName,
              args: call.args,
            });
            break;
        }
        localStorage.setItem(storageKey, hash);
      }
      setPhase("confirming");
      let replaced = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 45_000,
        onReplaced: ({ reason, transaction }) => {
          if (reason === "repriced")
            localStorage.setItem(storageKey, transaction.hash);
          else {
            localStorage.removeItem(storageKey);
            replaced = true;
          }
        },
      });
      if (replaced)
        throw new Error(
          "The transaction was cancelled or replaced in your wallet. Your progress is saved; you can try again.",
        );
      if (receipt.status === "reverted") {
        localStorage.removeItem(storageKey);
        throw new Error(
          "The transaction failed. Refresh the campaign and try again.",
        );
      }
      setPhase("syncing");
    } catch (error) {
      setPhase("idle");
      throw error;
    }
  }

  return {
    send,
    phase,
    reset: () => setPhase("idle"),
    busy: phase === "wallet" || phase === "confirming",
  };
}
