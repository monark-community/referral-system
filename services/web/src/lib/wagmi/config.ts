import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, hardhat } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';

// Hardhat local chain first so it's the default during development
const chains = [hardhat, sepolia, mainnet] as const;

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    metaMask({
      dappMetadata: {
        name: 'Reffinity',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://reffinity.io',
      },
      enableAnalytics: false,
    }),
  ],
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

// Re-export chains for use in components
export { hardhat, sepolia, mainnet };
