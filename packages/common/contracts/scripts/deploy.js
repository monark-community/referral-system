import hre from "hardhat";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  // Hardhat local private key (account #0)
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  );

  const publicClient = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });

  const walletClient = createWalletClient({
    account,
    transport: http("http://127.0.0.1:8545"),
  });

  // Get compiled artifact
  const artifact = await hre.artifacts.readArtifact("ReferralProgram");

  // Deploy contract
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [], // constructor args here
  });

  console.log("Deploy tx hash:", hash);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log("Contract deployed at:", receipt.contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
