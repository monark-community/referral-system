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
  var hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [], // constructor args here
  });

  console.log("Deploy tx hash:", hash);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log("Contract deployed at:", receipt.contractAddress);

  let request;
    // set points for referring someone
    ({ request } = await publicClient.simulateContract({
        account: account,
        address: receipt.contractAddress,
        abi: artifact.abi,
        functionName: "setPointsForAction",
        args: [0, 100], // args mean for action 0 (referring) you get 100 points
    }))
    var hash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    // set points for accepting invite
    ({ request } = await publicClient.simulateContract({
        account: account,
        address: receipt.contractAddress,
        abi: artifact.abi,
        functionName: "setPointsForAction",
        args: [1, 50], // args mean for action 0 (referring) you get 100 points
    }))
    var hash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
