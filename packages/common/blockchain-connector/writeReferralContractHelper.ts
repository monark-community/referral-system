import { contracts } from './contracts.js'

export class WriteReferralContractHelper {

    static async acceptInviteContext() {
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