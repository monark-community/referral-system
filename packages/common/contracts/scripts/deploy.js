// Purpose: Deploys the smart contracts to the selected node - eiher the default local node or the one provided
// Notes:
// - Also adds default settings such as points per action, and milestone amounts



import hre from "hardhat";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";


async function main() {

  const rpcUrl = process.env.HARDHAT_NODE_URL || "http://127.0.0.1:8545";
  console.log("Connecting to Hardhat node at:", rpcUrl);

  // Hardhat local private key (account #0)
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  );

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
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
        args: [1, 50], // args mean for action 1 (accepting invite) you get 50 points
    }))
    var hash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    // Set up milestone thresholds on-chain
    const milestoneThresholds = [500, 1500, 5000, 10000];
    for (const threshold of milestoneThresholds) {
        ({ request } = await publicClient.simulateContract({
            account: account,
            address: receipt.contractAddress,
            abi: artifact.abi,
            functionName: "addNewMilestone",
            args: [threshold],
        }));
        var hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
    }
    console.log("Milestones set:", milestoneThresholds);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
