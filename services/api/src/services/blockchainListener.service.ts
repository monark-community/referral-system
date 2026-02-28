import { prisma } from "../lib/prisma.js";
import type { PublicClient } from 'viem';
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract"; 
import {createWebSocketClient} from "@reffinity/blockchain-connector/clients";
import { log } from "console";


export class BlockchainListenerService {
    private isListening: boolean = false;
    private publicClient: PublicClient = createWebSocketClient(process.env.CHAIN_TYPE as 'localhost' | 'sepolia').publicClient;
    private readReferralContractService = new ReadReferralContractService({ publicClient: this.publicClient }); 


    async initialize(): Promise<void> {
        try {
            console.log("Initializing blockchain listener...");
            console.log("PublicClient:", await this.publicClient.getChainId());

            await this.syncToChain();
            await this.startPointsAddedListener();

            console.log("Blockchain listener initialized successfully.");
        } catch (error) {
            console.error("Error initializing blockchain listener:", error);
        }
    }

    private async startPointsAddedListener(): Promise<void>{
        if (this.isListening) {
            return;
        }

        try {

            await this.readReferralContractService.listenToPointsAddedEvent(async ({ user, points, blockNumber, logIndex }) => {
                console.log(`PointsAdded event detected for user ${user} with points ${points}`);
                // Update the user's points in the database
                const normalizedAddress = user.toLowerCase();       
                const existingUser = await prisma.user.findUnique({
                    where: { walletAddress: normalizedAddress },
                });
                if (existingUser) {
                    await prisma.user.update({
                    where: { walletAddress: normalizedAddress },
                    data: { earnedPoints: Number(points) }
                });
                } else {
                    console.warn(`User ${normalizedAddress} not found in DB, skipping points update`);
                }
                // Save new last processed block
                await prisma.chainSyncState.upsert({
                    where: { id: 1 },
                    update: { lastProcessedBlock: blockNumber, lastProcessedLogIndex: logIndex },
                    create: {
                        id: 1,
                        lastProcessedBlock: blockNumber,
                        lastProcessedLogIndex: logIndex
                    }
                });
                console.log(`Updated points for user ${normalizedAddress} to ${points}`);
            });

            this.isListening = true;
        } catch (error) {
            throw new Error(`Could not start blockchain listener: ${error instanceof Error ? error.message : String(error)}`);
        }
     }

    private async syncToChain(): Promise<void> {
        console.log("synchronising the DB to the chain state...");

        // Get last processed block from DB
        const state = await prisma.chainSyncState.findUnique({
            where: { id: 1 }
        });

        const latestBlock = await this.publicClient.getBlockNumber();

        const fromBlock: bigint = state?.lastProcessedBlock ?? 0n;
        const fromLogIndex: number = state?.lastProcessedLogIndex ?? 0;

        if (fromBlock >= latestBlock) {
            console.log("No catch-up needed.");
            return;
        }

        console.log(`Catching up from block ${fromBlock} to ${latestBlock}`);

        const events = await this.readReferralContractService.getPointsAddedEvents({
            fromBlock,
            toBlock: latestBlock
        });

        let lastProcessedBlock: bigint = fromBlock;
        let lastProcessedLogIndex: number = fromLogIndex;

        for (const event of events) {
            const { user, points } = event.args;
            const blockNumber: bigint = event.blockNumber!;
            const logIndex: number = event.logIndex!;

            //skip already loaded events
            if (
                blockNumber < fromBlock ||
                (blockNumber === fromBlock && logIndex <= fromLogIndex)
            ) {
                continue;
            }

            const normalizedAddress = user.toLowerCase();

            const existingUser = await prisma.user.findUnique({
                where: { walletAddress: normalizedAddress },
            });

            if (existingUser) {
                await prisma.user.update({
                    where: { walletAddress: normalizedAddress },
                    data: { earnedPoints: Number(points) }
                });
            }

            lastProcessedBlock = blockNumber;
            lastProcessedLogIndex = logIndex;
        }

        // Save new last processed block
        await prisma.chainSyncState.upsert({
            where: { id: 1 },
            update: { lastProcessedBlock: lastProcessedBlock, lastProcessedLogIndex: lastProcessedLogIndex },
            create: {
                id: 1,
                lastProcessedBlock: lastProcessedBlock,
                lastProcessedLogIndex: lastProcessedLogIndex
            }
        });

        console.log("Catch-up complete.");
    }

    stop(): void {
        if (this.isListening) {
            this.readReferralContractService.stopListeningToPointsAddedEvent();
            this.isListening = false;
            console.log('Blockchain listener stopped');
        }
    }

}
