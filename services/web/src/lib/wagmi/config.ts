// Purpose: Wagmi configuration - sets up MetaMask connector and RPC transports for Hardhat, Sepolia, and Mainnet
// Notes:
// - Hardhat (local chain) is listed first so it is the default during development
// - RPC URL defaults to localhost:8545 if NEXT_PUBLIC_RPC_URL is not set

import { createConfig, http } from "wagmi";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";
import { getE2EProvider } from "./e2e-provider";
import { blockchainNetwork } from "./network";

const chains =
  blockchainNetwork === "sepolia"
    ? ([sepolia, hardhat, mainnet] as const)
    : ([hardhat, sepolia, mainnet] as const);

const rpcURL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (blockchainNetwork === "localhost" ? "http://127.0.0.1:8545" : undefined);
if (!rpcURL) {
  throw new Error("NEXT_PUBLIC_RPC_URL is required for Sepolia");
}
const e2eWalletEnabled = process.env.NEXT_PUBLIC_E2E_WALLET_ENABLED === "true";
if (e2eWalletEnabled && blockchainNetwork !== "localhost") {
  throw new Error("The deterministic E2E wallet can only run on localhost");
}

const connectors = e2eWalletEnabled
  ? [
      injected({
        target: {
          id: "reffinityE2E",
          name: "Reffinity Test Wallet",
          provider: () => getE2EProvider(rpcURL) as any,
        },
      }),
    ]
  : [
      metaMask({
        dappMetadata: {
          name: "Reffinity",
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : "https://reffinity.io",
        },
        enableAnalytics: false,
      }),
    ];

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [hardhat.id]: http(blockchainNetwork === "localhost" ? rpcURL : undefined),
    [mainnet.id]: http(),
    [sepolia.id]: http(blockchainNetwork === "sepolia" ? rpcURL : undefined),
  },
});

// Re-export chains for use in components
export { hardhat, sepolia, mainnet };
export { activeChain, activeChainId, blockchainNetwork } from "./network";
