import type { Chain } from "viem";
import { hardhat, sepolia } from "viem/chains";

export type BlockchainNetwork = "localhost" | "sepolia";

export type BlockchainNetworkDefinition = {
  chain: Chain;
  defaultRpcUrl?: string;
  defaultWebSocketUrl?: string;
};

export const DEFAULT_BLOCKCHAIN_NETWORK: BlockchainNetwork = "localhost";

export const blockchainNetworks: Record<
  BlockchainNetwork,
  BlockchainNetworkDefinition
> = {
  localhost: {
    chain: hardhat,
    defaultRpcUrl: "http://127.0.0.1:8545",
    defaultWebSocketUrl: "ws://127.0.0.1:8545",
  },
  sepolia: {
    chain: sepolia,
  },
};

export function parseBlockchainNetwork(
  value?: string,
): BlockchainNetwork {
  const network = value || DEFAULT_BLOCKCHAIN_NETWORK;
  if (network !== "localhost" && network !== "sepolia") {
    throw new Error(
      `Unsupported blockchain network "${network}". Supported networks: localhost, sepolia`,
    );
  }
  return network;
}

export function getBlockchainNetworkDefinition(
  network: BlockchainNetwork,
): BlockchainNetworkDefinition {
  return blockchainNetworks[network];
}

export function getConfiguredBlockchainNetwork(): BlockchainNetwork {
  return parseBlockchainNetwork(
    process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK ??
      process.env.BLOCKCHAIN_NETWORK ??
      process.env.CHAIN_TYPE,
  );
}

export function expectedChainId(network: BlockchainNetwork): number {
  return getBlockchainNetworkDefinition(network).chain.id;
}
