// Purpose: Calls the Write functions on the Referral Smart Contracts - Relationships, Points, Invites, Milestones
// Notes:
// - These functions are generally more complicated than just one read, and completre several actions based on an event
// - These are just contexts that the appropriate secure wallet handlers can call, added so that there is only one location to change 

import { contracts } from "./contracts.js";

export class WriteReferralContractHelper {
  static async acceptInviteContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "acceptInvite",
    } as const;
  }

  static async joinProgramContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "joinProgram",
    } as const;
  }

  static async setPointsForActionContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "setPointsForAction",
    } as const;
  }

  static async setReferralSplitContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "setReferralSplit",
    } as const;
  }

  static async addMilestoneContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "addNewMilestone",
    } as const;
  }

  static async createInviteContext() {
    return {
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName: "createInvite",
    } as const;
  }
}
