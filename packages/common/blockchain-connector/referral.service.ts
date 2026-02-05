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


    async acceptInvite(user: '0x${string}') {
        const { request } = await this.clients.publicClient.simulateContract({
            address: contracts.referral.address.local,
            abi: contracts.referral.abi,
            account: user, // TODO integrate with the Metamask wallet for security
            functionName: 'acceptInvite',
        })
        const hash = await this.clients.walletClient.writeContract(request)

        return hash;
    }
        

}