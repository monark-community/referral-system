import { createPublicClient, http } from 'viem'
import { hardhat, sepolia} from 'viem/chains'

export function createClient(network: 'localhost' | 'sepolia' ){

    const chain = network === 'localhost'? hardhat : sepolia;

    if (!process.env.RPC_URL) {
        throw new Error("RPC_URL is not defined");
    }

    const publicClient = createPublicClient({
        chain: chain,
        transport: http(process.env.RPC_URL)
    })

    return {publicClient};
}
