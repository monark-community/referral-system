// Purpose: Viem Clients for interacting with the chain
// Notes:
// - Uses the environment variables to select the RPC URL which is the node we connect to
// - Uses the params to select for the type of chain - local or a online testnet
// - Web socket type clients may be suited for event listeners, but at least for local nodes seem less reliable

import { createPublicClient, http, webSocket } from "viem";
import type { PublicClient } from "viem";
import {
  getBlockchainNetworkDefinition,
  getConfiguredBlockchainNetwork,
  type BlockchainNetwork,
} from "./networks.js";

function configuredRpcUrl(network: BlockchainNetwork, rpcUrl?: string): string {
  const definition = getBlockchainNetworkDefinition(network);
  const configured = rpcUrl ?? process.env.RPC_URL ?? definition.defaultRpcUrl;
  if (!configured) {
    throw new Error(`RPC_URL is required for blockchain network ${network}`);
  }
  return configured;
}

export function createClient(
  network: BlockchainNetwork = getConfiguredBlockchainNetwork(),
  rpcUrl?: string,
) {
  const chain = getBlockchainNetworkDefinition(network).chain;
  const publicClient = createPublicClient({
    chain,
    transport: http(configuredRpcUrl(network, rpcUrl)),
  });

  return { publicClient };
}

export function createWebSocketClient(
  network: BlockchainNetwork = getConfiguredBlockchainNetwork(),
  rpcUrl?: string,
): {
  publicClient: PublicClient;
} {
  const definition = getBlockchainNetworkDefinition(network);
  const configured =
    rpcUrl ?? process.env.RPC_WEBSOCKET_URL ?? definition.defaultWebSocketUrl;
  if (!configured) {
    throw new Error(
      `RPC_WEBSOCKET_URL is required for blockchain network ${network}`,
    );
  }

  const publicClient = createPublicClient({
    chain: definition.chain,
    transport: webSocket(configured),
  });

  return { publicClient };
}
