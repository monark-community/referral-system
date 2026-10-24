// Purpose: Calls the Read functions on the Referral Smart Contracts - Relationships, Points, Invites, Milestones
// Notes:
// - Listeners are used to lighten the load of calling directly to the chain and have the DB as an intermediary, points and invites are the most common calls and have listeners

import { contracts } from "./contracts.js";
import { Address, Hash, Hex, WatchContractEventReturnType } from "viem";

export type ReferralAncestors = readonly [parent: Address, grandparent: Address];

export enum CampaignTaskType {
  Referral,
  Bounty,
}

export enum CampaignVerificationType {
  AutomaticChain,
  Manual,
}

export enum CampaignStatus {
  None,
  Active,
  Archived,
  PendingFunding,
}

export enum CampaignRewardType {
  Points,
  Direct,
}

export enum CampaignFulfillmentStatus {
  None,
  Submitted,
  Verified,
  Rejected,
}

export type Campaign = {
  id: Hex;
  owner: Address;
  taskType: CampaignTaskType;
  verificationType: CampaignVerificationType;
  status: CampaignStatus;
  rewardType: CampaignRewardType;
  completerReward: bigint;
  referralPool: bigint;
  balance: bigint;
};

export type CampaignFulfillment = {
  id: Hex;
  campaignId: Hex;
  participant: Address;
  status: CampaignFulfillmentStatus;
};

type ChainEventPosition = {
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hash;
};

export type CampaignCreatedEvent = ChainEventPosition & {
  campaignId: Hex;
  owner: Address;
  taskType: CampaignTaskType;
  verificationType: CampaignVerificationType;
  rewardType: CampaignRewardType;
  completerReward: bigint;
  referralPool: bigint;
};

export type CampaignFulfillmentSubmittedEvent = ChainEventPosition & {
  campaignId: Hex;
  fulfillmentId: Hex;
  participant: Address;
  taskType: CampaignTaskType;
};

export type CampaignFulfillmentVerifiedEvent = ChainEventPosition & {
  campaignId: Hex;
  fulfillmentId: Hex;
  verifier: Address;
  participant: Address;
  verificationType: CampaignVerificationType;
};

export type CampaignFulfillmentRejectedEvent = ChainEventPosition & {
  campaignId: Hex;
  fulfillmentId: Hex;
  verifier: Address;
  participant: Address;
};

// The referral pool's split, as ReferralAllocation.allocate returns it
export type ReferralPayout = {
  directRecipient: Address;
  grandparentRecipient: Address;
  directAmount: bigint;
  grandparentAmount: bigint;
  unallocatedAmount: bigint;
  rewardType: CampaignRewardType;
  campaignId: Hex;
};

export type CampaignRewardPaidEvent = ChainEventPosition & {
  campaignId: Hex;
  fulfillmentId: Hex;
  participant: Address;
  rewardType: CampaignRewardType;
  completerReward: bigint;
  referralPool: bigint;
  referralPayout: ReferralPayout;
};

export type DirectRewardAccruedEvent = ChainEventPosition & {
  account: Address;
  amount: bigint;
  balance: bigint;
};

export type DirectRewardsWithdrawnEvent = ChainEventPosition & {
  account: Address;
  destination: Address;
  amount: bigint;
};

enum InviteStatus {
  Pending,
  Accepted,
  Closed,
}

export class ReadReferralContractService {
  private unwatchPointsAddedEvent: WatchContractEventReturnType | null = null;
  private unwatchInviteChangedEvent: WatchContractEventReturnType | null = null;
  private unwatchReferralPointsAllocatedEvent: WatchContractEventReturnType | null = null;
  private unwatchCampaignCreatedEvent: WatchContractEventReturnType | null = null;
  private unwatchCampaignFulfillmentSubmittedEvent: WatchContractEventReturnType | null = null;
  private unwatchCampaignFulfillmentVerifiedEvent: WatchContractEventReturnType | null = null;
  private unwatchCampaignFulfillmentRejectedEvent: WatchContractEventReturnType | null = null;
  private unwatchCampaignRewardPaidEvent: WatchContractEventReturnType | null = null;
  private unwatchDirectRewardAccruedEvent: WatchContractEventReturnType | null = null;
  private unwatchDirectRewardsWithdrawnEvent: WatchContractEventReturnType | null = null;

  constructor(private clients: any) {}

  async getReferrals(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewReferrals",
      args: [userAddress],
    });
  }

  async getAllReferrals(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewAllReferrals",
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

  async getAncestors(userAddress: string): Promise<ReferralAncestors> {
    const ancestors = await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewAncestors",
      args: [userAddress],
    });

    return ancestors as ReferralAncestors;
  }

  async getUserCurrentPoints(userAddress: string) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewPoints",
      args: [userAddress],
    });
  }

  async getReferralPointPool() {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "viewReferralPointPool",
    });
  }

  async getDirectReferralBps() {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "directReferralBps",
    });
  }

  async getGrandparentReferralBps() {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "grandparentReferralBps",
    });
  }

  async previewReferralPointAllocation(
    userAddress: Address,
    pointPool: bigint,
  ) {
    return this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "previewReferralPointAllocation",
      args: [userAddress, pointPool],
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

  // The most points one campaign completion may pay, set by an admin
  async getMaxCampaignPointsPerCompletion(): Promise<bigint> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "maxCampaignPointsPerCompletion",
    })) as bigint;
  }

  // The most wei one direct-payment campaign completion may pay, set by an admin
  async getMaxCampaignDirectRewardPerCompletion(): Promise<bigint> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "maxCampaignDirectRewardPerCompletion",
    })) as bigint;
  }

  async getDirectRewardBalance(account: Address): Promise<bigint> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "directRewardBalances",
      args: [account],
    })) as bigint;
  }

  async getCampaign(campaignId: Hex): Promise<Campaign> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "getCampaign",
      args: [campaignId],
    })) as Campaign;
  }

  async getCampaignFulfillment(
    fulfillmentId: Hex,
  ): Promise<CampaignFulfillment> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "getCampaignFulfillment",
      args: [fulfillmentId],
    })) as CampaignFulfillment;
  }

  async getParticipantCampaignFulfillment(
    campaignId: Hex,
    participant: Address,
  ): Promise<CampaignFulfillment> {
    return (await this.clients.publicClient.readContract({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      functionName: "getParticipantCampaignFulfillment",
      args: [campaignId, participant],
    })) as CampaignFulfillment;
  }

  async listenToCampaignCreatedEvent(
    callback: (eventData: CampaignCreatedEvent) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchCampaignCreatedEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "CampaignCreated",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as CampaignCreatedEvent);
          }
        },
      });
  }

  async getCampaignCreatedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "CampaignCreated",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToCampaignCreatedEvent() {
    if (this.unwatchCampaignCreatedEvent) {
      this.unwatchCampaignCreatedEvent();
      this.unwatchCampaignCreatedEvent = null;
    }
  }

  async listenToCampaignFulfillmentSubmittedEvent(
    callback: (
      eventData: CampaignFulfillmentSubmittedEvent,
    ) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchCampaignFulfillmentSubmittedEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "CampaignFulfillmentSubmitted",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as CampaignFulfillmentSubmittedEvent);
          }
        },
      });
  }

  async getCampaignFulfillmentSubmittedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "CampaignFulfillmentSubmitted",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToCampaignFulfillmentSubmittedEvent() {
    if (this.unwatchCampaignFulfillmentSubmittedEvent) {
      this.unwatchCampaignFulfillmentSubmittedEvent();
      this.unwatchCampaignFulfillmentSubmittedEvent = null;
    }
  }

  async listenToCampaignFulfillmentVerifiedEvent(
    callback: (
      eventData: CampaignFulfillmentVerifiedEvent,
    ) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchCampaignFulfillmentVerifiedEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "CampaignFulfillmentVerified",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as CampaignFulfillmentVerifiedEvent);
          }
        },
      });
  }

  async getCampaignFulfillmentVerifiedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "CampaignFulfillmentVerified",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToCampaignFulfillmentVerifiedEvent() {
    if (this.unwatchCampaignFulfillmentVerifiedEvent) {
      this.unwatchCampaignFulfillmentVerifiedEvent();
      this.unwatchCampaignFulfillmentVerifiedEvent = null;
    }
  }

  async listenToCampaignFulfillmentRejectedEvent(
    callback: (
      eventData: CampaignFulfillmentRejectedEvent,
    ) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchCampaignFulfillmentRejectedEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "CampaignFulfillmentRejected",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as CampaignFulfillmentRejectedEvent);
          }
        },
      });
  }

  async getCampaignFulfillmentRejectedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "CampaignFulfillmentRejected",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToCampaignFulfillmentRejectedEvent() {
    if (this.unwatchCampaignFulfillmentRejectedEvent) {
      this.unwatchCampaignFulfillmentRejectedEvent();
      this.unwatchCampaignFulfillmentRejectedEvent = null;
    }
  }

  async listenToCampaignRewardPaidEvent(
    callback: (eventData: CampaignRewardPaidEvent) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchCampaignRewardPaidEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "CampaignRewardPaid",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as CampaignRewardPaidEvent);
          }
        },
      });
  }

  async getCampaignRewardPaidEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "CampaignRewardPaid",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToCampaignRewardPaidEvent() {
    if (this.unwatchCampaignRewardPaidEvent) {
      this.unwatchCampaignRewardPaidEvent();
      this.unwatchCampaignRewardPaidEvent = null;
    }
  }

  async listenToDirectRewardAccruedEvent(
    callback: (eventData: DirectRewardAccruedEvent) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchDirectRewardAccruedEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "DirectRewardAccrued",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as DirectRewardAccruedEvent);
          }
        },
      });
  }

  async getDirectRewardAccruedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "DirectRewardAccrued",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToDirectRewardAccruedEvent() {
    if (this.unwatchDirectRewardAccruedEvent) {
      this.unwatchDirectRewardAccruedEvent();
      this.unwatchDirectRewardAccruedEvent = null;
    }
  }

  async listenToDirectRewardsWithdrawnEvent(
    callback: (eventData: DirectRewardsWithdrawnEvent) => void | Promise<void>,
    pollingInterval = 10000,
  ) {
    this.unwatchDirectRewardsWithdrawnEvent =
      this.clients.publicClient.watchContractEvent({
        address: contracts.referral.address.local,
        abi: contracts.referral.abi,
        eventName: "DirectRewardsWithdrawn",
        pollingInterval,
        onLogs: async (logs: any) => {
          for (const log of logs) {
            if (!log.args) continue;
            await callback({
              ...log.args,
              blockNumber: log.blockNumber!,
              logIndex: log.logIndex!,
              transactionHash: log.transactionHash!,
            } as DirectRewardsWithdrawnEvent);
          }
        },
      });
  }

  async getDirectRewardsWithdrawnEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "DirectRewardsWithdrawn",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToDirectRewardsWithdrawnEvent() {
    if (this.unwatchDirectRewardsWithdrawnEvent) {
      this.unwatchDirectRewardsWithdrawnEvent();
      this.unwatchDirectRewardsWithdrawnEvent = null;
    }
  }

  //adds a listener for the PointsAdded event and calls the provided callback with the event data whenever the event is emitted
  async listenToPointsAddedEvent(
    callback: (eventData: {
      user: `0x${string}`;
      points: bigint;
      isPending: boolean;
      blockNumber: bigint;
      logIndex: number;
    }) => void | Promise<void>,
    pollingInterval?: number,
  ) {
    const unwatch = this.clients.publicClient.watchContractEvent({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "PointsAdded",
      pollingInterval: pollingInterval ? pollingInterval : 10000,
      onLogs: async (logs: any) => {
        for (const log of logs) {
          if (!log.args) continue;

          const { user, points, isPending } = log.args as {
            user: `0x${string}`;
            points: bigint;
            isPending: boolean;
          };

          await callback({
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

  async listenToReferralPointsAllocatedEvent(
    callback: (eventData: {
      participant: Address;
      pool: bigint;
      directRecipient: Address;
      directAmount: bigint;
      grandparentRecipient: Address;
      grandparentAmount: bigint;
      unallocatedAmount: bigint;
      blockNumber: bigint;
      logIndex: number;
      transactionHash: Hash;
    }) => void | Promise<void>,
    pollingInterval?: number,
  ) {
    const unwatch = this.clients.publicClient.watchContractEvent({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "ReferralPointsAllocated",
      pollingInterval: pollingInterval ? pollingInterval : 10000,
      onLogs: async (logs: any) => {
        for (const log of logs) {
          if (!log.args) continue;

          const {
            participant,
            pool,
            directRecipient,
            directAmount,
            grandparentRecipient,
            grandparentAmount,
            unallocatedAmount,
          } = log.args as {
            participant: Address;
            pool: bigint;
            directRecipient: Address;
            directAmount: bigint;
            grandparentRecipient: Address;
            grandparentAmount: bigint;
            unallocatedAmount: bigint;
          };

          await callback({
            participant,
            pool,
            directRecipient,
            directAmount,
            grandparentRecipient,
            grandparentAmount,
            unallocatedAmount,
            blockNumber: log.blockNumber!,
            logIndex: log.logIndex!,
            transactionHash: log.transactionHash!,
          });
        }
      },
    });

    this.unwatchReferralPointsAllocatedEvent = unwatch;
  }

  async getReferralPointsAllocatedEvents({
    fromBlock,
    toBlock,
  }: {
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.clients.publicClient.getContractEvents({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "ReferralPointsAllocated",
      fromBlock,
      toBlock,
    });
  }

  async stopListeningToReferralPointsAllocatedEvent() {
    if (this.unwatchReferralPointsAllocatedEvent) {
      this.unwatchReferralPointsAllocatedEvent();
      this.unwatchReferralPointsAllocatedEvent = null;
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
    }) => void | Promise<void>,
    pollingInterval?: number,
  ) {
    const unwatch = this.clients.publicClient.watchContractEvent({
      address: contracts.referral.address.local,
      abi: contracts.referral.abi,
      eventName: "InviteChanged",
      pollingInterval: pollingInterval ? pollingInterval : 10000,
      onLogs: async (logs: any) => {
        for (const log of logs) {
          if (!log.args) continue;
          const { inviteId, referrer, status } = log.args as {
            inviteId: `0x${string}`;
            referrer: `0x${string}`;
            status: InviteStatus;
          };
          await callback({
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
