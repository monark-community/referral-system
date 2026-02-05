import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat, sepolia} from 'viem/chains'

export function createClients(network: 'localhost' | 'sepolia' ){

    const chain = network === 'localhost'? hardhat : sepolia;

    if (!process.env.RPC_URL) {
        throw new Error("RPC_URL is not defined");
    }

    var account;

    const publicClient = createPublicClient({
        chain: chain,
        transport: http(process.env.RPC_URL)
    })

    const walletClient = createWalletClient({
        chain: chain,
        transport: http(process.env.RPC_URL)
    })

    return {publicClient, walletClient};
}
