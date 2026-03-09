import { prisma } from "../lib/prisma.js";
import type { PublicClient } from "viem";
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract";
import { createWebSocketClient } from "@reffinity/blockchain-connector/clients";
import { log } from "console";

export class BlockchainListenerService {
  private isListeningToPointsAdded: boolean = false;
  private isListeningToInviteChanged: boolean = false;
  private publicClient: PublicClient = createWebSocketClient(
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

      console.log("Blockchain listener initialized successfully.");
    } catch (error) {
      console.error("Error initializing blockchain listener:", error);
    }
  }

  // Starts listening to the PointsAdded event from the referral contract and updates the database accordingly
  private async startPointsAddedListener(): Promise<void> {
    if (this.isListeningToPointsAdded) {
      return;
    }

    try {
      await this.readReferralContractService.listenToPointsAddedEvent(
        async ({ user, points, blockNumber, logIndex }) => {
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
                earnedPoints: Number(points),
                milestoneLevel,
              },
            });
            // Mark pending referral as completed now that on-chain event confirmed
            await prisma.referral.updateMany({
              where: { refereeId: existingUser.id, status: 0 },
              data: { status: 1 },
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
              where: { id: inviteId },
              data: { status: status },
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
        const { user, points } = event.args;
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
              earnedPoints: Number(points),
              milestoneLevel,
            },
          });
          // Mark pending referral as completed now that on-chain event confirmed
          await prisma.referral.updateMany({
            where: { refereeId: existingUser.id, status: 0 },
            data: { status: 1 },
          });
        }
      } else if ("inviteId" in event.args) {
        // InviteChanged event
        const { inviteId, referrer, status } = event.args;

        await prisma.referral.updateMany({
          where: { id: inviteId },
          data: { status: status },
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

  stop(): void {
    if (this.isListeningToPointsAdded) {
      this.readReferralContractService.stopListeningToPointsAddedEvent();
      this.isListeningToPointsAdded = false;
      console.log("Blockchain listener stopped");
    }
  }
}
