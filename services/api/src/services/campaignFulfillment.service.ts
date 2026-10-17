// Purpose: Projects a completed built-in referral transaction into one replay-safe campaign fulfillment
// Notes:
// - Reads a successful receipt; never writes to a contract or awards points
// - Commits VERIFIED before attempting REWARDED so incomplete corroboration remains durable
// - Does not replace the existing User, Referral, or ReferralPointAllocation projections

import { RefferalABI } from "@reffinity/common-contracts";
import { bytes32ToUuid } from "@reffinity/blockchain-connector/uuidBytesConverter";
import { decodeEventLog, type Address, type Hash, type Hex } from "viem";
import { prisma } from "../lib/prisma.js";
import { getBuiltinReferralCampaign } from "./campaign.service.js";

const INVITE_ACCEPTED = 1;

type ReceiptLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  logIndex: number | null;
};

type SuccessfulReceipt = {
  status: "success" | "reverted";
  transactionHash: Hash;
  blockNumber: bigint;
  to: Address | null;
  logs: readonly ReceiptLog[];
};

export type CampaignFulfillmentReadClient = {
  getChainId(): Promise<number>;
  getTransactionReceipt(args: { hash: Hash }): Promise<SuccessfulReceipt>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
};

export type ReferralAllocationAnchor = {
  transactionHash: Hash;
  logIndex: number;
};

export type CampaignFulfillmentProjectionResult =
  | {
      outcome: "DEFERRED";
      reason: "REFERRAL_NOT_FOUND";
      transactionHash: string;
    }
  | {
      outcome: "VERIFIED" | "REWARDED";
      fulfillmentId: string;
      referralId: string;
      participantId: string;
      transactionHash: string;
      replayed: boolean;
    };

export type CampaignFulfillmentProjectionErrorCode =
  | "INVALID_RECEIPT"
  | "MISSING_ALLOCATION_EVENT"
  | "AMBIGUOUS_REFERRAL"
  | "EVENT_CONFLICT"
  | "FULFILLMENT_CONFLICT";

export class CampaignFulfillmentProjectionError extends Error {
  constructor(
    public readonly code: CampaignFulfillmentProjectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CampaignFulfillmentProjectionError";
  }
}

export type CampaignFulfillmentReconciliationIssue = {
  allocationId: string;
  transactionHash: string;
  logIndex: number;
  code:
    | CampaignFulfillmentProjectionErrorCode
    | "INVALID_TRANSACTION_HASH"
    | "UNEXPECTED_ERROR";
  message: string;
};

export type CampaignFulfillmentReconciliationSummary = {
  scanned: number;
  rewarded: number;
  verified: number;
  deferred: number;
  replayed: number;
  legacy: number;
  failed: number;
};

type CampaignFulfillmentProjector = (
  client: CampaignFulfillmentReadClient,
  anchor: ReferralAllocationAnchor,
) => Promise<CampaignFulfillmentProjectionResult>;

export type CampaignFulfillmentReconciliationOptions = {
  batchSize?: number;
  onIssue?: (issue: CampaignFulfillmentReconciliationIssue) => void;
  projector?: CampaignFulfillmentProjector;
};

export type CurrentCampaignFulfillment = {
  id: string;
  taskId: string;
  participantId: string;
  referralId: string | null;
  attempt: number;
  status: "PENDING" | "VERIFIED" | "REWARDED";
  chainId: number;
  verificationTransactionHash: string | null;
  verificationBlockNumber: bigint | null;
  verificationLogIndex: number | null;
  rewardTransactionHash: string | null;
  rewardBlockNumber: bigint | null;
  rewardLogIndex: number | null;
  verifiedAt: Date | null;
  rewardedAt: Date | null;
};

const currentFulfillmentSelect = {
  id: true,
  taskId: true,
  participantId: true,
  referralId: true,
  attempt: true,
  status: true,
  chainId: true,
  verificationTransactionHash: true,
  verificationBlockNumber: true,
  verificationLogIndex: true,
  rewardTransactionHash: true,
  rewardBlockNumber: true,
  rewardLogIndex: true,
  verifiedAt: true,
  rewardedAt: true,
} as const;

type DecodedEvent = {
  eventName: string;
  args: Record<string, unknown>;
  logIndex: number;
};

type LinkedReferral = {
  id: string;
  referee: { id: string; walletAddress: string };
  referrer: { walletAddress: string };
};

function normalize(value: string): string {
  return value.toLowerCase();
}

function decodeProgramEvents(receipt: SuccessfulReceipt): DecodedEvent[] {
  if (!receipt.to) {
    throw new CampaignFulfillmentProjectionError(
      "INVALID_RECEIPT",
      "Referral fulfillment receipt has no destination contract",
    );
  }

  const contractAddress = normalize(receipt.to);
  const decoded: DecodedEvent[] = [];
  for (const log of receipt.logs) {
    if (normalize(log.address) !== contractAddress || log.logIndex === null) {
      continue;
    }
    try {
      const event = decodeEventLog({
        abi: RefferalABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (
        event.eventName === "ReferralPointsAllocated" ||
        event.eventName === "PointsAdded" ||
        event.eventName === "InviteChanged"
      ) {
        decoded.push({
          eventName: event.eventName,
          args: event.args as Record<string, unknown>,
          logIndex: log.logIndex,
        });
      }
    } catch {
      // A receipt may contain unrelated logs from the same contract ABI surface.
    }
  }
  return decoded.sort((left, right) => left.logIndex - right.logIndex);
}

function requireAddress(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new CampaignFulfillmentProjectionError(
      "EVENT_CONFLICT",
      `${field} is missing from the decoded event`,
    );
  }
  return normalize(value);
}

function requireBytes32(value: unknown, field: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new CampaignFulfillmentProjectionError(
      "EVENT_CONFLICT",
      `${field} is not a bytes32 value`,
    );
  }
  return value as `0x${string}`;
}

function sameStoredEvent(
  storedHash: string | null,
  storedBlock: bigint | null,
  storedIndex: number | null,
  expectedHash: string,
  expectedBlock: bigint,
  expectedIndex: number,
): boolean {
  return (
    storedHash === null ||
    (normalize(storedHash) === expectedHash &&
      storedBlock === expectedBlock &&
      storedIndex === expectedIndex)
  );
}

function assertFulfillmentIdentity(
  fulfillment: {
    taskId: string;
    participantId: string;
    referralId: string | null;
    chainId: number;
    verificationTransactionHash: string | null;
    verificationBlockNumber: bigint | null;
    verificationLogIndex: number | null;
  },
  expected: {
    taskId: string;
    participantId: string;
    referralId: string;
    chainId: number;
    transactionHash: string;
    blockNumber: bigint;
    verificationLogIndex: number;
  },
): void {
  if (
    fulfillment.taskId !== expected.taskId ||
    fulfillment.participantId !== expected.participantId ||
    fulfillment.referralId !== expected.referralId ||
    fulfillment.chainId !== expected.chainId ||
    !sameStoredEvent(
      fulfillment.verificationTransactionHash,
      fulfillment.verificationBlockNumber,
      fulfillment.verificationLogIndex,
      expected.transactionHash,
      expected.blockNumber,
      expected.verificationLogIndex,
    )
  ) {
    throw new CampaignFulfillmentProjectionError(
      "FULFILLMENT_CONFLICT",
      `Existing fulfillment conflicts with referral ${expected.referralId}`,
    );
  }
}

async function findLinkedReferral(
  participant: string,
  directRecipient: string,
): Promise<LinkedReferral | null> {
  const matches = await prisma.referral.findMany({
    where: {
      referee: { walletAddress: participant },
      referrer: { walletAddress: directRecipient },
    },
    select: {
      id: true,
      referee: { select: { id: true, walletAddress: true } },
      referrer: { select: { walletAddress: true } },
    },
    take: 2,
  });

  if (matches.length > 1) {
    throw new CampaignFulfillmentProjectionError(
      "AMBIGUOUS_REFERRAL",
      `Multiple referrals link participant ${participant} to ${directRecipient}`,
    );
  }
  const match = matches[0];
  if (!match?.referee) {
    return null;
  }
  return match as LinkedReferral;
}

export async function projectBuiltinReferralFulfillment(
  client: CampaignFulfillmentReadClient,
  anchor: ReferralAllocationAnchor,
): Promise<CampaignFulfillmentProjectionResult> {
  const transactionHash = normalize(anchor.transactionHash);
  const receipt = await client.getTransactionReceipt({ hash: anchor.transactionHash });
  if (
    receipt.status !== "success" ||
    normalize(receipt.transactionHash) !== transactionHash
  ) {
    throw new CampaignFulfillmentProjectionError(
      "INVALID_RECEIPT",
      `Transaction ${transactionHash} does not have a matching successful receipt`,
    );
  }

  const events = decodeProgramEvents(receipt);
  const allocationEvents = events.filter(
    (event) =>
      event.eventName === "ReferralPointsAllocated" &&
      event.logIndex === anchor.logIndex,
  );
  if (allocationEvents.length !== 1) {
    throw new CampaignFulfillmentProjectionError(
      "MISSING_ALLOCATION_EVENT",
      `Transaction ${transactionHash} does not contain the anchored allocation event`,
    );
  }

  const allocation = allocationEvents[0];
  const participant = requireAddress(
    allocation.args.participant,
    "ReferralPointsAllocated.participant",
  );
  const directRecipient = requireAddress(
    allocation.args.directRecipient,
    "ReferralPointsAllocated.directRecipient",
  );
  const linkedReferral = await findLinkedReferral(participant, directRecipient);
  if (!linkedReferral) {
    return { outcome: "DEFERRED", reason: "REFERRAL_NOT_FOUND", transactionHash };
  }

  if (
    normalize(linkedReferral.referee.walletAddress) !== participant ||
    normalize(linkedReferral.referrer.walletAddress) !== directRecipient
  ) {
    throw new CampaignFulfillmentProjectionError(
      "EVENT_CONFLICT",
      `Referral ${linkedReferral.id} does not match the allocation participants`,
    );
  }

  const [campaign, chainId, block] = await Promise.all([
    getBuiltinReferralCampaign(),
    client.getChainId(),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  const blockTime = new Date(Number(block.timestamp) * 1000);
  const idempotencyKey = `builtin-referral:${chainId}:${linkedReferral.id}:1`;
  const identity = {
    taskId: campaign.task.id,
    participantId: linkedReferral.referee.id,
    referralId: linkedReferral.id,
    chainId,
    transactionHash,
    blockNumber: receipt.blockNumber,
    verificationLogIndex: allocation.logIndex,
  };

  let replayed = false;
  const verified = await prisma.$transaction(async (tx) => {
    replayed = Boolean(
      await tx.campaignFulfillment.findUnique({ where: { idempotencyKey } }),
    );
    const existing = await tx.campaignFulfillment.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        taskId: campaign.task.id,
        participantId: linkedReferral.referee.id,
        referralId: linkedReferral.id,
        attempt: 1,
        idempotencyKey,
        status: "VERIFIED",
        chainId,
        verificationTransactionHash: transactionHash,
        verificationBlockNumber: receipt.blockNumber,
        verificationLogIndex: allocation.logIndex,
        verifiedAt: blockTime,
      },
    });
    assertFulfillmentIdentity(existing, identity);
    if (existing.status === "PENDING") {
      return tx.campaignFulfillment.update({
        where: { id: existing.id },
        data: {
          status: "VERIFIED",
          verificationTransactionHash: transactionHash,
          verificationBlockNumber: receipt.blockNumber,
          verificationLogIndex: allocation.logIndex,
          verifiedAt: blockTime,
        },
      });
    }
    return existing;
  });

  const participantPointEvents = events.filter(
    (event) =>
      event.eventName === "PointsAdded" &&
      event.logIndex > allocation.logIndex &&
      requireAddress(event.args.user, "PointsAdded.user") === participant &&
      event.args.isPending === false,
  );
  const acceptedInviteEvents = events.filter(
    (event) =>
      event.eventName === "InviteChanged" &&
      event.logIndex > allocation.logIndex &&
      event.args.status === INVITE_ACCEPTED,
  );

  if (participantPointEvents.length === 0 || acceptedInviteEvents.length === 0) {
    return {
      outcome: "VERIFIED",
      fulfillmentId: verified.id,
      referralId: linkedReferral.id,
      participantId: linkedReferral.referee.id,
      transactionHash,
      replayed,
    };
  }
  if (participantPointEvents.length !== 1 || acceptedInviteEvents.length !== 1) {
    throw new CampaignFulfillmentProjectionError(
      "EVENT_CONFLICT",
      `Transaction ${transactionHash} has ambiguous reward or invite events`,
    );
  }

  const rewardEvent = participantPointEvents[0];
  const inviteEvent = acceptedInviteEvents[0];
  const inviteId = bytes32ToUuid(
    requireBytes32(inviteEvent.args.inviteId, "InviteChanged.inviteId"),
  );
  const inviteReferrer = requireAddress(
    inviteEvent.args.referrer,
    "InviteChanged.referrer",
  );
  if (
    inviteId !== linkedReferral.id ||
    inviteReferrer !== directRecipient ||
    inviteEvent.logIndex <= rewardEvent.logIndex
  ) {
    throw new CampaignFulfillmentProjectionError(
      "EVENT_CONFLICT",
      `Transaction ${transactionHash} invite evidence conflicts with referral ${linkedReferral.id}`,
    );
  }

  const rewarded = await prisma.$transaction(async (tx) => {
    const current = await tx.campaignFulfillment.findUniqueOrThrow({
      where: { id: verified.id },
    });
    assertFulfillmentIdentity(current, identity);
    if (
      current.rewardTransactionHash !== null &&
      !sameStoredEvent(
        current.rewardTransactionHash,
        current.rewardBlockNumber,
        current.rewardLogIndex,
        transactionHash,
        receipt.blockNumber,
        rewardEvent.logIndex,
      )
    ) {
      throw new CampaignFulfillmentProjectionError(
        "FULFILLMENT_CONFLICT",
        `Existing reward evidence conflicts with fulfillment ${current.id}`,
      );
    }
    if (current.status === "REWARDED") {
      return current;
    }
    return tx.campaignFulfillment.update({
      where: { id: current.id },
      data: {
        status: "REWARDED",
        rewardTransactionHash: transactionHash,
        rewardBlockNumber: receipt.blockNumber,
        rewardLogIndex: rewardEvent.logIndex,
        rewardedAt: blockTime,
      },
    });
  });

  return {
    outcome: "REWARDED",
    fulfillmentId: rewarded.id,
    referralId: linkedReferral.id,
    participantId: linkedReferral.referee.id,
    transactionHash,
    replayed,
  };
}

function requireTransactionHash(value: string): Hash {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new CampaignFulfillmentProjectionError(
      "INVALID_RECEIPT",
      `Stored transaction hash ${value} is invalid`,
    );
  }
  return value as Hash;
}

/**
 * Replays persisted allocation anchors through the same projector used by the live listener.
 * Each row is isolated so one legacy or malformed allocation cannot block startup recovery.
 */
export async function reconcileBuiltinReferralFulfillments(
  client: CampaignFulfillmentReadClient,
  options: CampaignFulfillmentReconciliationOptions = {},
): Promise<CampaignFulfillmentReconciliationSummary> {
  const requestedBatchSize = Math.trunc(options.batchSize ?? 100);
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.min(1000, Math.max(1, requestedBatchSize))
    : 100;
  const projector = options.projector ?? projectBuiltinReferralFulfillment;
  const summary: CampaignFulfillmentReconciliationSummary = {
    scanned: 0,
    rewarded: 0,
    verified: 0,
    deferred: 0,
    replayed: 0,
    legacy: 0,
    failed: 0,
  };
  let cursor: string | undefined;

  while (true) {
    const allocations = await prisma.referralPointAllocation.findMany({
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, transactionHash: true, logIndex: true },
    });

    for (const allocation of allocations) {
      summary.scanned += 1;
      try {
        const transactionHash = requireTransactionHash(
          allocation.transactionHash,
        );
        const result = await projector(client, {
          transactionHash,
          logIndex: allocation.logIndex,
        });
        if (result.outcome === "REWARDED") summary.rewarded += 1;
        if (result.outcome === "VERIFIED") summary.verified += 1;
        if (result.outcome === "DEFERRED") summary.deferred += 1;
        if (result.outcome !== "DEFERRED" && result.replayed) summary.replayed += 1;
      } catch (error) {
        const projectionError =
          error instanceof CampaignFulfillmentProjectionError ? error : null;
        const isInvalidStoredHash =
          projectionError?.code === "INVALID_RECEIPT" &&
          projectionError.message.startsWith("Stored transaction hash");
        const isLegacy = projectionError?.code === "MISSING_ALLOCATION_EVENT";
        if (isLegacy) summary.legacy += 1;
        else summary.failed += 1;
        options.onIssue?.({
          allocationId: allocation.id,
          transactionHash: allocation.transactionHash,
          logIndex: allocation.logIndex,
          code: isInvalidStoredHash
            ? "INVALID_TRANSACTION_HASH"
            : projectionError?.code ?? "UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (allocations.length < batchSize) break;
    cursor = allocations[allocations.length - 1]?.id;
    if (!cursor) break;
  }

  return summary;
}

/**
 * Bounded read-through recovery for a single fulfillment. This is intentionally internal
 * service support; Part 5 does not expose a manual reconciliation endpoint or command.
 */
export async function refreshBuiltinReferralFulfillment(
  client: CampaignFulfillmentReadClient,
  fulfillmentId: string,
  projector: CampaignFulfillmentProjector = projectBuiltinReferralFulfillment,
): Promise<CampaignFulfillmentProjectionResult | null> {
  const fulfillment = await prisma.campaignFulfillment.findUnique({
    where: { id: fulfillmentId },
    select: {
      verificationTransactionHash: true,
      verificationLogIndex: true,
    },
  });
  if (
    !fulfillment?.verificationTransactionHash ||
    fulfillment.verificationLogIndex === null
  ) {
    return null;
  }

  return projector(client, {
    transactionHash: requireTransactionHash(
      fulfillment.verificationTransactionHash,
    ),
    logIndex: fulfillment.verificationLogIndex,
  });
}

// The built-in referral task only uses these three; the other states belong to user campaigns
const BUILTIN_FULFILLMENT_STATUSES: readonly string[] = ["PENDING", "VERIFIED", "REWARDED"];

function asBuiltinFulfillment<T extends { id: string; status: string }>(
  row: T,
): T & { status: CurrentCampaignFulfillment["status"] } {
  if (!BUILTIN_FULFILLMENT_STATUSES.includes(row.status)) {
    throw new Error(`Fulfillment ${row.id} has status ${row.status}, which the built-in campaign never uses`);
  }
  return row as T & { status: CurrentCampaignFulfillment["status"] };
}

export async function getCurrentBuiltinReferralFulfillment(
  taskId: string,
  participantId: string,
): Promise<CurrentCampaignFulfillment | null> {
  const row = await prisma.campaignFulfillment.findFirst({
    where: { taskId, participantId },
    orderBy: { attempt: "desc" },
    select: currentFulfillmentSelect,
  });
  return row ? asBuiltinFulfillment(row) : null;
}

/**
 * Attempts one idempotent refresh and always returns the latest durable row. A temporary
 * receipt/provider failure is diagnostic only and must not turn a valid status read into an error.
 */
export async function refreshCurrentBuiltinReferralFulfillment(
  client: CampaignFulfillmentReadClient,
  fulfillment: CurrentCampaignFulfillment,
  onRefreshError?: (error: unknown) => void,
): Promise<CurrentCampaignFulfillment> {
  if (fulfillment.status !== "VERIFIED") return fulfillment;

  try {
    await refreshBuiltinReferralFulfillment(client, fulfillment.id);
  } catch (error) {
    onRefreshError?.(error);
  }

  const refreshed = await prisma.campaignFulfillment.findUnique({
    where: { id: fulfillment.id },
    select: currentFulfillmentSelect,
  });
  return refreshed ? asBuiltinFulfillment(refreshed) : fulfillment;
}
