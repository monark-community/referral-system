// Purpose: Calls the Read functions on the Referral Smart Contracts - Relationships, Points, Invites, Milestones
// Notes:
// - Listeners are used to lighten the load of calling directly to the chain and have the DB as an intermediary, points and invites are the most common calls and have listeners

import { contracts } from "./contracts.js";
import { WatchContractEventReturnType } from "viem";

enum InviteStatus {
  Pending,
  Accepted,
  Closed,
}

export class ReadReferralContractService {
  private unwatchPointsAddedEvent: WatchContractEventReturnType | null = null;
  private unwatchInviteChangedEvent: WatchContractEventReturnType | null = null;

  constructor(private clients: any) {}

  async getReferrals(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewReferrals",
      args: [userAddress],
    });
  }

  async getReferrers(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewReferrer",
      args: [userAddress],
    });
  }

  async getUserCurrentPoints(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewPoints",
      args: [userAddress],
    });
  }

  async getUserCurrentMilestone(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "getCurrentUserMilestone",
      args: [userAddress],
    });
  }

  //adds a listener for the PointsAdded event and calls the provided callback with the event data whenever the event is emitted
  async listenToPointsAddedEvent(
    callback: (eventData: {
      user: `0x${string}`;
      points: bigint;
      isPending: boolean;
      blockNumber: bigint;
      logIndex: number;
    }) => void,
    pollingInterval?: number,
  ) {
    const unwatch = this.clients.publicClient.watchContractEvent({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "PointsAdded",
      pollingInterval: pollingInterval ? pollingInterval : 10000,
      onLogs: (logs: any) => {
        for (const log of logs) {
          if (!log.args) continue;

          const { user, points, isPending } = log.args as {
            user: `0x${string}`;
            points: bigint;
            isPending: boolean;
          };

          callback({
            user,
            points,
            isPending,
            blockNumber: log.blockNumber!,
            logIndex: log.logIndex!,
          });
        }
      },
    });

    this.unwatchPointsAddedEvent = unwatch;
  }

  async getPointsAddedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return await this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "PointsAdded",
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

  //adds a listener for the Invite Changed event and calls the provided callback with the event data whenever the event is emitted

  async listenToInviteChangedEvent(
    callback: (eventData: {
      inviteId: `0x${string}`;
      status: InviteStatus;
      referrer: `0x${string}`;
      blockNumber: bigint;
      logIndex: number;
    }) => void,
    pollingInterval?: number,
  ) {
    const unwatch = this.clients.publicClient.watchContractEvent({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "InviteChanged",
      pollingInterval: pollingInterval ? pollingInterval : 10000,
      onLogs: (logs: any) => {
        for (const log of logs) {
          if (!log.args) continue;
          const { inviteId, referrer, status } = log.args as {
            inviteId: `0x${string}`;
            referrer: `0x${string}`;
            status: InviteStatus;
          };
          callback({
            inviteId,
            status,
            referrer,
            blockNumber: log.blockNumber!,
            logIndex: log.logIndex!,
          });
        }
      },
    });

    this.unwatchInviteChangedEvent = unwatch;
  }

  async getInviteChangedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return await this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "InviteChanged",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToInviteChangedEvent() {
    if (this.unwatchInviteChangedEvent) {
      this.unwatchInviteChangedEvent();
      this.unwatchInviteChangedEvent = null;
    }
  }
}
