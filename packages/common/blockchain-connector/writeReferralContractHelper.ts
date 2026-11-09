// Purpose: Calls the Write functions on the Referral Smart Contracts - Relationships, Points, Invites, Milestones
// Notes:
// - These functions are generally more complicated than just one read, and completre several actions based on an event
// - These are just contexts that the appropriate secure wallet handlers can call, added so that there is only one location to change 

import { contracts } from "./contracts.js";

export class WriteReferralContractHelper {
  static async acceptInviteContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "acceptInvite",
    } as const;
  }

  static async joinProgramContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "joinProgram",
    } as const;
  }

  static async setPointsForActionContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "setPointsForAction",
    } as const;
  }

  static async setReferralSplitContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "setReferralSplit",
    } as const;
  }

  static async addMilestoneContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "addNewMilestone",
    } as const;
  }

  static async createInviteContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "createInvite",
    } as const;
  }

  static async createCampaignContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "createCampaign",
    } as const;
  }

  static async createCampaignWithVisibilityContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "createCampaignWithVisibility",
    } as const;
  }

  static async setMaxCampaignPointsPerCompletionContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "setMaxCampaignPointsPerCompletion",
    } as const;
  }

  static async setMaxCampaignDirectRewardPerCompletionContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "setMaxCampaignDirectRewardPerCompletion",
    } as const;
  }

  static async fundCampaignContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "fundCampaign",
    } as const;
  }

  static async withdrawDirectRewardsContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "withdrawDirectRewards",
    } as const;
  }

  static async submitCampaignFulfillmentContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "submitCampaignFulfillment",
    } as const;
  }

  static async createPreVerifiedCampaignFulfillmentContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "createPreVerifiedCampaignFulfillment",
    } as const;
  }

  static async completePreVerifiedCampaignFulfillmentContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "completePreVerifiedCampaignFulfillment",
    } as const;
  }

  static async verifyCampaignFulfillmentContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "verifyCampaignFulfillment",
    } as const;
  }

  static async rejectCampaignFulfillmentContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address,
      functionName: "rejectCampaignFulfillment",
    } as const;
  }
}
