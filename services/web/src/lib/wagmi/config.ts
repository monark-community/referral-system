import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';

// Use Sepolia testnet for development
const chains = [sepolia, mainnet] as const;

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    metaMask({
      dappMetadata: {
        name: 'Reffinity',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://reffinity.io',
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

// Re-export chains for use in components
export { sepolia, mainnet };
