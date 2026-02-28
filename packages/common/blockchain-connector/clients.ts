import { createPublicClient, http, webSocket } from 'viem'
import type { PublicClient } from 'viem'
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

export function createWebSocketClient(network: 'localhost' | 'sepolia'): { publicClient: PublicClient } {

    const chain = network === 'localhost'? hardhat : sepolia;

    if (!process.env.RPC_WEBSOCKET_URL) {
        throw new Error("RPC_WEBSOCKET_URL is not defined");
    }

    const publicClient = createPublicClient({
        chain: chain,
        transport: webSocket(process.env.RPC_WEBSOCKET_URL)
    });

    return { publicClient };
}
