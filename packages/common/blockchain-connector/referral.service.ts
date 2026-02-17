import { contracts } from './contracts.js'

export class ReferrelService{
    
    constructor(private clients: any ) {    }

    async getReferrals(user: '0x${string}') {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewReferrals',
            account: user // TODO integrate with the Metamask wallet for security
        })
    }

    async getReferrers(user: '0x${string}') {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewReferrers',
            account: user // TODO integrate with the Metamask wallet for security
        })
    }


    async acceptInvite(user: '0x${string}', referrerAddress: string) {
        const { request } = await this.clients.publicClient.simulateContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            account: user, // TODO integrate with the Metamask wallet for security
            functionName: 'acceptInvite',
            args: [referrerAddress]
        })
        const hash = await this.clients.walletClient.writeContract(request)

        return hash;
    }

    async joinProgram(user: '0x${string}') {
        // joinProgram
        const { request } = await this.clients.publicClient.simulateContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            account: user, // TODO integrate with the Metamask wallet for security
            functionName: 'joinprogram',
        })
        var hash = await this.clients.walletClient.writeContract(request)
        await this.clients.publicClient.waitForTransactionReceipt({ hash });
    }

    async setPointsForAction(user: '0x${string}', action: number, pointValue: number) {
        // joinProgram
        const { request } = await this.clients.publicClient.simulateContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            account: user, // TODO integrate with the Metamask wallet for security
            functionName: 'setPointsForAction',
            args: [action, pointValue]
        })
        var hash = await this.clients.walletClient.writeContract(request)
        await this.clients.publicClient.waitForTransactionReceipt({ hash });
    }
        
    async addMilestone(user: '0x${string}', milestoneValue: number) {
        // joinProgram
        const { request } = await this.clients.publicClient.simulateContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            account: user, // TODO integrate with the Metamask wallet for security
            functionName: 'addNewMilestone',
            args: [milestoneValue]
        })
        var hash = await this.clients.walletClient.writeContract(request)
        await this.clients.publicClient.waitForTransactionReceipt({ hash });
    }

    async getuserCurrentPoints(user: '0x${string}') {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'viewPoints',
            account: user // TODO integrate with the Metamask wallet for security
        })
    }

    async getUserCurrentMilestone(user: '0x${string}') {
        return this.clients.publicClient.readContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            functionName: 'getCurrentUserMilestone',
            account: user // TODO integrate with the Metamask wallet for security
        })
    }
    

}