import { configuredReferralAddress } from "@reffinity/blockchain-connector/contracts";
import {
  expectedChainId,
  getBlockchainNetworkDefinition,
  getConfiguredBlockchainNetwork,
  type BlockchainNetwork,
} from "@reffinity/blockchain-connector/networks";
import type { Address } from "viem";

export type ApiBlockchainConfig = {
  network: BlockchainNetwork;
  chainId: number;
  rpcUrl: string;
  webSocketUrl?: string;
  contractAddress: Address;
};

let cachedConfig: ApiBlockchainConfig | undefined;

export function getApiBlockchainConfig(): ApiBlockchainConfig {
  if (cachedConfig) return cachedConfig;

  const network = getConfiguredBlockchainNetwork();
  const definition = getBlockchainNetworkDefinition(network);
  const rpcUrl = process.env.RPC_URL ?? definition.defaultRpcUrl;
  if (!rpcUrl) {
    throw new Error(`RPC_URL is required for blockchain network ${network}`);
  }

  cachedConfig = {
    network,
    chainId: expectedChainId(network),
    rpcUrl,
    webSocketUrl:
      process.env.RPC_WEBSOCKET_URL ?? definition.defaultWebSocketUrl,
    contractAddress: configuredReferralAddress(),
  };
  return cachedConfig;
}

export function resetApiBlockchainConfigForTests(): void {
  cachedConfig = undefined;
}
