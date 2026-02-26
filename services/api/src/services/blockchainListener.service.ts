import { prisma } from "../lib/prisma.js";
import type { PublicClient } from 'viem';
import { ReadReferralContractService } from "@reffinity/blockchain-connector/readReferralContract"; 
import {createWebSocketClient} from "@reffinity/blockchain-connector/clients";


export class BlockchainListenerService {
    private isListening: boolean = false;
    private publicClient: PublicClient = createWebSocketClient(process.env.CHAIN_TYPE as 'localhost' | 'sepolia').publicClient;
    private readReferralContractService = new ReadReferralContractService({ publicClient: this.publicClient }); 


    async initialize(): Promise<void> {
        try {
            console.log("Initializing blockchain listener...");
            console.log("PublicClient:", await this.publicClient.getChainId());
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

            await this.readReferralContractService.listenToPointsAddedEvent(async ({ user, points }) => {
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
                console.log(`Updated points for user ${normalizedAddress} to ${points}`);
            });

            this.isListening = true;
        } catch (error) {
            throw new Error(`Could not start blockchain listener: ${error instanceof Error ? error.message : String(error)}`);
        }
     }

    stop(): void {
        if (this.isListening) {
        this.readReferralContractService.stopListeningToPointsAddedEvent();
        this.isListening = false;
        console.log('Blockchain listener stopped');
        }
    }

}
