// Purpose: Creates a listener service that listens for events on the referral contract
// Notes:
// - Passes callable functions to the blockchain-connector listener
// - Syncs to the chain on startup
// - An invite's points come from the payout event that names it, or for a pending invite from the
//   referrer's share of the pool; balance changes are never used, since they can't tell which invite
//   (or whether a grandparent's share) they belong to

import { prisma } from "../lib/prisma.js";
import { type PublicClient } from "viem";
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract";
import {
  createWebSocketClient,
  createClient,
} from "@reffinity/blockchain-connector/clients";
import { log } from "console";
import { bytes32ToUuid } from "@reffinity/blockchain-connector/uuidBytesConverter";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BASIS_POINTS = 10_000n;
// Matches InviteStatus.Pending in the contract
const INVITE_PENDING = 0;

export class BlockchainListenerService {
  private isListeningToPointsAdded: boolean = false;
  private isListeningToInviteChanged: boolean = false;
  private isListeningToReferralPointsAllocated: boolean = false;
  private publicClient: any = createClient(
    process.env.CHAIN_TYPE as "localhost" | "sepolia",
  ).publicClient;
  private readReferralContractService = new ReadReferralContractService({
    publicClient: this.publicClient,
  });

  async initialize(): Promise<void> {
    try {
      console.log("Initializing blockchain listener...");
      console.log("PublicClient:", await this.publicClient.getChainId());

      await this.syncToChain();
      await this.startPointsAddedListener();
      await this.startInviteChangedListener();
      await this.startReferralPointsAllocatedListener();

      console.log("Blockchain listener initialized successfully.");
    } catch (error) {
      console.error("Error initializing blockchain listener:", error);
    }
  }

  private async persistReferralPointAllocation(event: {
    participant: string;
    pool: bigint;
    directRecipient: string;
    directAmount: bigint;
    grandparentRecipient: string;
    grandparentAmount: bigint;
    unallocatedAmount: bigint;
    blockNumber: bigint;
    logIndex: number;
    transactionHash: string;
  }): Promise<void> {
    const data = {
      transactionHash: event.transactionHash.toLowerCase(),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      participantWalletAddress: event.participant.toLowerCase(),
      pool: Number(event.pool),
      directRecipientWalletAddress: event.directRecipient.toLowerCase(),
      directAmount: Number(event.directAmount),
      grandparentRecipientWalletAddress:
        event.grandparentRecipient.toLowerCase(),
      grandparentAmount: Number(event.grandparentAmount),
      unallocatedAmount: Number(event.unallocatedAmount),
    };

    await prisma.referralPointAllocation.upsert({
      where: {
        transactionHash_logIndex: {
          transactionHash: data.transactionHash,
          logIndex: data.logIndex,
        },
      },
      update: data,
      create: data,
    });

    // The invite this payout came from is the one between the direct recipient and the new user.
    // The grandparent's share belongs to no invite of theirs, so it only lives in the payout above
    if (data.directAmount > 0) {
      await prisma.referral.updateMany({
        where: {
          referrer: { walletAddress: data.directRecipientWalletAddress },
          referee: { walletAddress: data.participantWalletAddress },
        },
        data: { points: data.directAmount },
      });
    }
  }

  // Saves an invite's new on-chain status. A newly pending invite also gets the points its
  // referrer will earn once it is accepted
  private async applyInviteChange(
    inviteId: `0x${string}`,
    referrer: string,
    status: number,
  ): Promise<void> {
    const id = bytes32ToUuid(inviteId);
    await prisma.referral.updateMany({
      where: { id },
      data: { status, isVerified: true },
    });

    if (status === INVITE_PENDING) {
      let points: number;
      try {
        points = await this.referrerShareOfPool(referrer);
      } catch {
        // Like a failed milestone read, this must not stop the listener from starting
        console.warn(
          `Could not read the referral pool for invite ${inviteId}, leaving its points`,
        );
        return;
      }
      // An invite someone already signed up with gets its points from the payout instead
      await prisma.referral.updateMany({
        where: { id, refereeId: null },
        data: { points },
      });
    }
  }

  // The referrer's share of the referral pool, split the same way as ReferralAllocation.allocate:
  // all of it without a grandparent, otherwise the pool minus the grandparent's rounded-down share.
  // Uses the current pool and split; the contract fixes them when the invite is created, so the
  // two only differ if an admin changes them in between
  private async referrerShareOfPool(referrer: string): Promise<number> {
    const [pool, grandparentBps, grandparent] = await Promise.all([
      this.readReferralContractService.getReferralPointPool(),
      this.readReferralContractService.getGrandparentReferralBps(),
      this.readReferralContractService.getReferrers(referrer),
    ]);
    const poolPoints = BigInt(pool);
    if (String(grandparent).toLowerCase() === ZERO_ADDRESS) {
      return Number(poolPoints);
    }
    return Number(
      poolPoints - (poolPoints * BigInt(grandparentBps)) / BASIS_POINTS,
    );
  }

  private async startReferralPointsAllocatedListener(): Promise<void> {
    if (this.isListeningToReferralPointsAllocated) {
      return;
    }

    try {
      await this.readReferralContractService.listenToReferralPointsAllocatedEvent(
        async (event) => {
          await this.persistReferralPointAllocation(event);
          await prisma.chainSyncState.upsert({
            where: { id: 1 },
            update: {
              lastReferralAllocationBlock: event.blockNumber,
              lastReferralAllocationLogIndex: event.logIndex,
            },
            create: {
              id: 1,
              lastProcessedBlock: 0n,
              lastProcessedLogIndex: 0,
              lastReferralAllocationBlock: event.blockNumber,
              lastReferralAllocationLogIndex: event.logIndex,
            },
          });
        },
        10000,
      );
      this.isListeningToReferralPointsAllocated = true;
    } catch (error) {
      throw new Error(
        `Could not start blockchain listener: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Starts listening to the PointsAdded event from the referral contract and updates the database accordingly
  private async startPointsAddedListener(): Promise<void> {
    if (this.isListeningToPointsAdded) {
      return;
    }

    try {
      await this.readReferralContractService.listenToPointsAddedEvent(
        async ({ user, points, isPending, blockNumber, logIndex }) => {
          console.log(
            `PointsAdded event detected for user ${user} with points ${points}`,
          );
          // Update the user's points in the database
          const normalizedAddress = user.toLowerCase();
          const existingUser = await prisma.user.findUnique({
            where: { walletAddress: normalizedAddress },
          });
          if (existingUser) {
            // Read milestone level from chain
            let milestoneLevel = existingUser.milestoneLevel;
            try {
              const chainMilestone =
                await this.readReferralContractService.getUserCurrentMilestone(
                  user,
                );
              milestoneLevel = Number(chainMilestone);
            } catch (err) {
              console.warn(
                `Could not read milestone for ${normalizedAddress}, keeping existing`,
              );
            }

            await prisma.user.update({
              where: { walletAddress: normalizedAddress },
              data: {
                ...(isPending
                  ? { pendingPoints: Number(points) }
                  : { earnedPoints: Number(points) }),
                milestoneLevel,
              },
            });
          } else {
            console.warn(
              `User ${normalizedAddress} not found in DB, skipping points update`,
            );
          }
          // Save new last processed block
          await prisma.chainSyncState.upsert({
            where: { id: 1 },
            update: {
              lastProcessedBlock: blockNumber,
              lastProcessedLogIndex: logIndex,
            },
            create: {
              id: 1,
              lastProcessedBlock: blockNumber,
              lastProcessedLogIndex: logIndex,
            },
          });
          console.log(
            `Updated points for user ${normalizedAddress} to ${points}`,
          );
        },
        10000,
      );

      this.isListeningToPointsAdded = true;
    } catch (error) {
      throw new Error(
        `Could not start blockchain listener: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Starts listening to the InviteChanged event from the referral contract and updates the database accordingly
  private async startInviteChangedListener(): Promise<void> {
    if (this.isListeningToInviteChanged) {
      return;
    }

    try {
      await this.readReferralContractService.listenToInviteChangedEvent(
        async ({ inviteId, status, referrer, blockNumber, logIndex }) => {
          console.log(
            `InviteChanged event detected for invite ${inviteId} with status ${status}`,
          );

          const normalizedReferrer = referrer.toLowerCase();

          try {
            await this.applyInviteChange(inviteId, referrer, status);

            console.log(
              `Invite ${inviteId} stored with status ${status} for referrer ${normalizedReferrer}`,
            );
          } catch (err) {
            console.error(`Failed to update invite ${inviteId}`, err);
          }

          // Save new last processed block
          await prisma.chainSyncState.upsert({
            where: { id: 1 },
            update: {
              lastProcessedBlock: blockNumber,
              lastProcessedLogIndex: logIndex,
            },
            create: {
              id: 1,
              lastProcessedBlock: blockNumber,
              lastProcessedLogIndex: logIndex,
            },
          });
        },
        10000,
      );
      this.isListeningToInviteChanged = true;
    } catch (error) {
      throw new Error(
        `Could not start blockchain listener: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async syncToChain(): Promise<void> {
    console.log("Synchronising the DB to the chain state...");

    // Last processed state
    const state = await prisma.chainSyncState.findUnique({ where: { id: 1 } });
    const latestBlock = await this.publicClient.getBlockNumber();

    await this.syncReferralPointAllocations(state, latestBlock);

    const fromBlock: bigint = state?.lastProcessedBlock ?? 0n;
    const fromLogIndex: number = state?.lastProcessedLogIndex ?? 0;

    if (fromBlock >= latestBlock) {
      console.log("No catch-up needed.");
      return;
    }

    console.log(`Catching up from block ${fromBlock} to ${latestBlock}`);

    // Fetch all relevant events
    const pointsEvents =
      await this.readReferralContractService.getPointsAddedEvents({
        fromBlock,
        toBlock: latestBlock,
      });

    const inviteEvents =
      await this.readReferralContractService.getInviteChangedEvents({
        fromBlock,
        toBlock: latestBlock,
      });

    // Merge & sort all events by blockNumber + logIndex
    const allEvents = [...pointsEvents, ...inviteEvents].sort((a, b) => {
      if (a.blockNumber! < b.blockNumber!) return -1;
      if (a.blockNumber! > b.blockNumber!) return 1;
      return a.logIndex! - b.logIndex!;
    });

    let lastProcessedBlock: bigint = fromBlock;
    let lastProcessedLogIndex: number = fromLogIndex;

    for (const event of allEvents) {
      const { blockNumber, logIndex } = event;

      // Skip already processed events
      if (
        blockNumber < fromBlock ||
        (blockNumber === fromBlock && logIndex <= fromLogIndex)
      )
        continue;

      // Determine event type by existence of fields
      if ("points" in event.args) {
        // PointsAdded event
        const { user, points, isPending } = event.args;
        const normalizedAddress = user.toLowerCase();

        const existingUser = await prisma.user.findUnique({
          where: { walletAddress: normalizedAddress },
        });

        if (existingUser) {
          // Read milestone level from chain
          let milestoneLevel = existingUser.milestoneLevel;
          try {
            const chainMilestone =
              await this.readReferralContractService.getUserCurrentMilestone(
                user,
              );
            milestoneLevel = Number(chainMilestone);
          } catch {
            // Keep existing milestone level on error
          }

          await prisma.user.update({
            where: { walletAddress: normalizedAddress },
            data: {
              ...(isPending
                ? { pendingPoints: Number(points) }
                : { earnedPoints: Number(points) }),
              milestoneLevel,
            },
          });
        }
      } else if ("inviteId" in event.args) {
        // InviteChanged event
        const { inviteId, referrer, status } = event.args;

        await this.applyInviteChange(inviteId, referrer, status);
        console.log(
          `InviteChanged: inviteId=${inviteId}, referrer=${referrer}, status=${status}`,
        );
      }

      // Update last processed state
      lastProcessedBlock = blockNumber;
      lastProcessedLogIndex = logIndex;
    }
    // Persist last processed block/logIndex
    await prisma.chainSyncState.upsert({
      where: { id: 1 },
      update: { lastProcessedBlock, lastProcessedLogIndex },
      create: { id: 1, lastProcessedBlock, lastProcessedLogIndex },
    });

    console.log("Catch-up complete.");
  }

  private async syncReferralPointAllocations(
    state: {
      lastProcessedBlock: bigint;
      lastProcessedLogIndex: number;
      lastReferralAllocationBlock?: bigint;
      lastReferralAllocationLogIndex?: number;
    } | null,
    latestBlock: bigint,
  ): Promise<void> {
    const fromBlock = state?.lastReferralAllocationBlock ?? 0n;
    const fromLogIndex = state?.lastReferralAllocationLogIndex ?? -1;

    if (fromBlock >= latestBlock) {
      return;
    }

    const events = (await this.readReferralContractService.getReferralPointsAllocatedEvents(
      {
        fromBlock,
        toBlock: latestBlock,
      },
    )) as Array<{
      blockNumber: bigint;
      logIndex: number;
      transactionHash: string;
      args: {
        participant: string;
        pool: bigint;
        directRecipient: string;
        directAmount: bigint;
        grandparentRecipient: string;
        grandparentAmount: bigint;
        unallocatedAmount: bigint;
      };
    }>;

    let lastProcessedBlock = latestBlock;
    let lastProcessedLogIndex = -1;
    for (const event of events.sort((a, b) => {
      if (a.blockNumber < b.blockNumber) return -1;
      if (a.blockNumber > b.blockNumber) return 1;
      return a.logIndex - b.logIndex;
    })) {
      if (
        event.blockNumber < fromBlock ||
        (event.blockNumber === fromBlock && event.logIndex <= fromLogIndex)
      ) {
        continue;
      }

      await this.persistReferralPointAllocation({
        ...event.args,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        transactionHash: event.transactionHash,
      });
      lastProcessedBlock = event.blockNumber;
      lastProcessedLogIndex = event.logIndex;
    }

    if (lastProcessedBlock < latestBlock) {
      lastProcessedBlock = latestBlock;
      lastProcessedLogIndex = -1;
    }

    await prisma.chainSyncState.upsert({
      where: { id: 1 },
      update: {
        lastReferralAllocationBlock: lastProcessedBlock,
        lastReferralAllocationLogIndex: lastProcessedLogIndex,
      },
      create: {
        id: 1,
        lastProcessedBlock: state?.lastProcessedBlock ?? 0n,
        lastProcessedLogIndex: state?.lastProcessedLogIndex ?? 0,
        lastReferralAllocationBlock: lastProcessedBlock,
        lastReferralAllocationLogIndex: lastProcessedLogIndex,
      },
    });
  }

  stop(): void {
    if (this.isListeningToPointsAdded) {
      this.readReferralContractService.stopListeningToPointsAddedEvent();
      this.isListeningToPointsAdded = false;
      console.log("Blockchain listener stopped");
    }
    if (this.isListeningToInviteChanged) {
      this.readReferralContractService.stopListeningToInviteChangedEvent();
      this.isListeningToInviteChanged = false;
    }
    if (this.isListeningToReferralPointsAllocated) {
      this.readReferralContractService.stopListeningToReferralPointsAllocatedEvent();
      this.isListeningToReferralPointsAllocated = false;
    }
  }
}
