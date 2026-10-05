import { prisma } from "../lib/prisma.js";
import { markNotReady, markReady } from "../readiness.js";
import { clearE2EEmails } from "./e2eMailbox.service.js";
import type { BlockchainListenerService } from "./blockchainListener.service.js";

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code: number; message: string };
};

export type E2EResetResult = {
  generation: number;
  blockNumber: string;
  contractAddress: string;
  counts: {
    users: number;
    referrals: number;
    referralPointAllocations: number;
    chainSyncStates: number;
    milestoneTiers: number;
  };
};

export type E2EListenerResult = {
  listening: boolean;
  syncState: {
    lastProcessedBlock: string;
    lastProcessedLogIndex: number;
    lastReferralAllocationBlock: string;
    lastReferralAllocationLogIndex: number;
  } | null;
};

let listener: BlockchainListenerService | undefined;
let baselineSnapshotId: string | undefined;
let generation = 0;
let resetQueue: Promise<void> = Promise.resolve();

export function isE2EResetConfigured(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.E2E_ENABLE_STATE_RESET === "true" &&
    typeof process.env.E2E_RESET_KEY === "string" &&
    process.env.E2E_RESET_KEY.length >= 16 &&
    process.env.CHAIN_TYPE === "localhost"
  );
}

function assertConfigured(): void {
  if (!isE2EResetConfigured()) {
    throw new Error(
      "State reset requires NODE_ENV=test, E2E_ENABLE_STATE_RESET=true, an E2E_RESET_KEY of at least 16 characters, and CHAIN_TYPE=localhost",
    );
  }
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(process.env.RPC_URL ?? "http://hardhat:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(
      `Hardhat RPC ${method} failed: ${JSON.stringify(payload.error ?? payload)}`,
    );
  }
  return payload.result;
}

async function takeSnapshot(): Promise<string> {
  const snapshotId = await rpc<string>("evm_snapshot");
  if (!/^0x[0-9a-f]+$/i.test(snapshotId)) {
    throw new Error(`Hardhat returned an invalid snapshot id: ${snapshotId}`);
  }
  return snapshotId;
}

export async function initializeE2EReset(
  blockchainListener: BlockchainListenerService,
): Promise<void> {
  if (!isE2EResetConfigured()) return;
  listener = blockchainListener;
  baselineSnapshotId = await takeSnapshot();
  generation = 0;
  console.log(`E2E state-reset baseline captured at ${baselineSnapshotId}`);
}

async function databaseCounts(): Promise<E2EResetResult["counts"]> {
  const [users, referrals, referralPointAllocations, chainSyncStates, milestoneTiers] =
    await Promise.all([
      prisma.user.count(),
      prisma.referral.count(),
      prisma.referralPointAllocation.count(),
      prisma.chainSyncState.count(),
      prisma.milestoneTier.count(),
    ]);
  return { users, referrals, referralPointAllocations, chainSyncStates, milestoneTiers };
}

async function performReset(): Promise<E2EResetResult> {
  assertConfigured();
  if (!listener || !baselineSnapshotId) {
    throw new Error("E2E state-reset baseline has not been initialized");
  }

  markNotReady("e2e_state_resetting");
  await listener.stop();

  try {
    const reverted = await rpc<boolean>("evm_revert", [baselineSnapshotId]);
    if (!reverted) throw new Error(`Hardhat could not revert snapshot ${baselineSnapshotId}`);
    baselineSnapshotId = await takeSnapshot();

    await prisma.$executeRaw`
      TRUNCATE TABLE
        "referral_point_allocations",
        "referrals",
        "users",
        "milestone_tiers",
        "ChainSyncState"
      RESTART IDENTITY CASCADE
    `;
    clearE2EEmails();

    const contractAddress = process.env.REFERRAL_CONTRACT_ADDRESS ?? "";
    const code = await rpc<string>("eth_getCode", [contractAddress, "latest"]);
    if (!code || code === "0x") {
      throw new Error(`Baseline did not restore ReferralProgram at ${contractAddress}`);
    }

    await listener.initialize();
    const counts = await databaseCounts();
    if (
      counts.users !== 0 ||
      counts.referrals !== 0 ||
      counts.referralPointAllocations !== 0 ||
      counts.milestoneTiers !== 0
    ) {
      throw new Error(`Database reset left application rows behind: ${JSON.stringify(counts)}`);
    }

    generation += 1;
    markReady();
    return {
      generation,
      blockNumber: await rpc<string>("eth_blockNumber"),
      contractAddress,
      counts,
    };
  } catch (error) {
    markNotReady("e2e_state_reset_failed");
    throw error;
  }
}

export async function resetE2EState(): Promise<E2EResetResult> {
  let release!: () => void;
  const predecessor = resetQueue;
  resetQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await predecessor;
  try {
    return await performReset();
  } finally {
    release();
  }
}

async function listenerResult(listening: boolean): Promise<E2EListenerResult> {
  const state = await prisma.chainSyncState.findUnique({ where: { id: 1 } });
  return {
    listening,
    syncState: state
      ? {
          lastProcessedBlock: state.lastProcessedBlock.toString(),
          lastProcessedLogIndex: state.lastProcessedLogIndex,
          lastReferralAllocationBlock: state.lastReferralAllocationBlock.toString(),
          lastReferralAllocationLogIndex: state.lastReferralAllocationLogIndex,
        }
      : null,
  };
}

export async function pauseE2EListener(): Promise<E2EListenerResult> {
  assertConfigured();
  if (!listener) throw new Error("E2E listener has not been initialized");
  markNotReady("e2e_listener_paused");
  await listener.stop();
  return listenerResult(false);
}

export async function restartE2EListener(): Promise<E2EListenerResult> {
  assertConfigured();
  if (!listener) throw new Error("E2E listener has not been initialized");
  markNotReady("e2e_listener_restarting");
  try {
    await listener.initialize();
    markReady();
    return listenerResult(true);
  } catch (error) {
    markNotReady("e2e_listener_restart_failed");
    throw error;
  }
}
