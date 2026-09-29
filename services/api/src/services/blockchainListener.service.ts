// Purpose: Creates a listener service that listens for events on the referral contract
// Notes:
// - Passes callable functions to the blockchain-connector listener
// - Syncs to the chain on startup

import { prisma } from "../lib/prisma.js";
import { type PublicClient } from "viem";
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract";
import {
  createWebSocketClient,
  createClient,
} from "@reffinity/blockchain-connector/clients";
import { log } from "console";
import { bytes32ToUuid } from "@reffinity/blockchain-connector/uuidBytesConverter";

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

            if (!isPending) {
              const earnedDelta = Number(points) - existingUser.earnedPoints;
              await prisma.user.update({
                where: { walletAddress: normalizedAddress },
                data: {
                  earnedPoints: Number(points),
                  milestoneLevel,
                },
              });
              // Assign per-referral points to the most recent accepted referral with 0 points
              if (earnedDelta > 0) {
                const referral = await prisma.referral.findFirst({
                  where: { referrerId: existingUser.id, status: 1, points: 0 },
                  orderBy: { updatedAt: "desc" },
                });
                if (referral) {
                  await prisma.referral.update({
                    where: { id: referral.id },
                    data: { points: earnedDelta },
                  });
                }
              }
            } else {
              const pendingDelta = Number(points) - existingUser.pendingPoints;
              await prisma.user.update({
                where: { walletAddress: normalizedAddress },
                data: {
                  pendingPoints: Number(points),
                  milestoneLevel,
                },
              });
              // Assign per-referral points to the most recent pending referral with 0 points
              if (pendingDelta > 0) {
                const referral = await prisma.referral.findFirst({
                  where: { referrerId: existingUser.id, status: 0, points: 0 },
                  orderBy: { createdAt: "desc" },
                });
                if (referral) {
                  await prisma.referral.update({
                    where: { id: referral.id },
                    data: { points: pendingDelta },
                  });
                }
              }
            }
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
            await prisma.referral.updateMany({
              where: { id: bytes32ToUuid(inviteId) },
              data: {
                status: status,
                isVerified: true,
              },
            });

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

          if (!isPending) {
            const earnedDelta = Number(points) - existingUser.earnedPoints;
            await prisma.user.update({
              where: { walletAddress: normalizedAddress },
              data: {
                earnedPoints: Number(points),
                milestoneLevel,
              },
            });
            if (earnedDelta > 0) {
              const referral = await prisma.referral.findFirst({
                where: { referrerId: existingUser.id, status: 1, points: 0 },
                orderBy: { updatedAt: "desc" },
              });
              if (referral) {
                await prisma.referral.update({
                  where: { id: referral.id },
                  data: { points: earnedDelta },
                });
              }
            }
          } else {
            const pendingDelta = Number(points) - existingUser.pendingPoints;
            await prisma.user.update({
              where: { walletAddress: normalizedAddress },
              data: {
                pendingPoints: Number(points),
                milestoneLevel,
              },
            });
            if (pendingDelta > 0) {
              const referral = await prisma.referral.findFirst({
                where: { referrerId: existingUser.id, status: 0, points: 0 },
                orderBy: { createdAt: "desc" },
              });
              if (referral) {
                await prisma.referral.update({
                  where: { id: referral.id },
                  data: { points: pendingDelta },
                });
              }
            }
          }
        }
      } else if ("inviteId" in event.args) {
        // InviteChanged event
        const { inviteId, referrer, status } = event.args;

        await prisma.referral.updateMany({
          where: { id: bytes32ToUuid(inviteId) },
          data: { status: status, isVerified: true },
        });
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
