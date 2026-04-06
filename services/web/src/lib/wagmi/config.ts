// Purpose: Wagmi configuration - sets up MetaMask connector and RPC transports for Hardhat, Sepolia, and Mainnet
// Notes:
// - Hardhat (local chain) is listed first so it is the default during development
// - RPC URL defaults to localhost:8545 if NEXT_PUBLIC_RPC_URL is not set

import { createConfig, http } from "wagmi";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

// Hardhat local chain first so it's the default during development
const chains = [hardhat, sepolia, mainnet] as const;

const rpcURL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

export const wagmiConfig = createConfig({
  chains,
  connectors: [
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
  ],
  transports: {
    [hardhat.id]: http(rpcURL),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

// Re-export chains for use in components
export { hardhat, sepolia, mainnet };
