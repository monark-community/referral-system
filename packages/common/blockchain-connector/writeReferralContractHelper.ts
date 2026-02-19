import { contracts } from './contracts.js'
import type { Address } from 'viem'

export class WriteReferralContractHelper {

    static async staticacceptInviteContext() {
        return {
            abi: contracts.referral.abi,
            address: contracts.referral.address.local,
            functionName: 'acceptInvite',
        }
    }

    static async joinProgramContext() {
        return {
            abi: contracts.referral.abi,
            address: contracts.referral.address.local,
            functionName: 'joinProgram',
        }
    }

    static async setPointsForActionContext() {
        return {
            abi: contracts.referral.abi,
            address: contracts.referral.address.local,
            functionName: 'setPointsForAction',
        }
    }

    static async addMilestoneContext() {
        return {
            abi: contracts.referral.abi,
            address: contracts.referral.address.local,
            functionName: 'addNewMilestone',
        }
    }
}