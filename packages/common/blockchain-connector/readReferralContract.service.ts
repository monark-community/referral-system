import { contracts } from './contracts.js'

export class ReadReferralContractService {
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
}