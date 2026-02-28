import { contracts } from './contracts.js'
import { WatchContractEventReturnType } from 'viem'

export class ReadReferralContractService {
    private unwatchPointsAddedEvent: WatchContractEventReturnType | null = null;

    constructor(private clients: any) {}

    async getReferrals(userAddress: string) {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewReferrals',
            args: [userAddress]
        })
    }

    async getReferrers(userAddress : string) {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewReferrer',
            args: [userAddress]
        })
    }


    async getUserCurrentPoints(userAddress: string) {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewPoints',
            args: [userAddress]
        })
    }

    async getUserCurrentMilestone(userAddress: string) {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'getCurrentUserMilestone',
            args: [userAddress] 
        })
    }


    //adds a listener for the PointsAdded event and calls the provided callback with the event data whenever the event is emitted
    async listenToPointsAddedEvent(
        callback: (eventData: {
            user: `0x${string}`;
            points: bigint;
            blockNumber: bigint;
            logIndex: number;
        }) => void) {
        const unwatch = this.clients.publicClient.watchContractEvent({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            eventName: 'PointsAdded',
            onLogs: (logs: any) => {
            for (const log of logs) {
                if (!log.args) continue;

                const { user, points } = log.args as {
                user: `0x${string}`;
                points: bigint;
                };

                callback({
                user,
                points,
                blockNumber: log.blockNumber!,
                logIndex: log.logIndex!
                });
            }
            },
        });

        this.unwatchPointsAddedEvent = unwatch;
    }

    async getPointsAddedEvents({
        fromBlock,
        toBlock
    }: {
        fromBlock: bigint;
        toBlock: bigint;
    }) {
        return await this.clients.publicClient.getContractEvents({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            eventName: 'PointsAdded',
            fromBlock,
            toBlock,
        });
    }

    async stopListeningToPointsAddedEvent() {
        if (this.unwatchPointsAddedEvent) {
            this.unwatchPointsAddedEvent();
            this.unwatchPointsAddedEvent = null;
        }
    }
}