import { hardhat, sepolia } from "wagmi/chains";

export const blockchainNetwork =
  process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "localhost";

if (blockchainNetwork !== "localhost" && blockchainNetwork !== "sepolia") {
  throw new Error(
    `Unsupported NEXT_PUBLIC_BLOCKCHAIN_NETWORK: ${blockchainNetwork}`,
  );
}

export const activeChain = blockchainNetwork === "sepolia" ? sepolia : hardhat;
export const activeChainId = activeChain.id;
