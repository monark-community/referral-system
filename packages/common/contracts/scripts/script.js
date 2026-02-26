import hre from "hardhat";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import artifact from "../artifacts/contracts/ReferralProgram.sol/ReferralProgram.json";

//manual test script allowing you to interact with the contract

async function main() {
  // Hardhat local private key (account #0)
  const account = privateKeyToAccount(
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
  );

  const publicClient = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });

  const walletClient = createWalletClient({
    account,
    transport: http("http://127.0.0.1:8545"),
  });

    const hash = await walletClient.writeContract({ 
      account,
      address: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
      abi: artifact.abi,
      functionName: 'acceptInvite',
      args: ['0x70997970c51812dc3a010c7d01b50e0d17dc79c8'],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log(receipt.logs)

    // const events = await publicClient.getContractEvents({
    //   address: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    //   abi: artifact.abi,
    //   eventName: 'PointsAdded',
    // })

    // console.log(events)

    // const value = await publicClient.readContract({ 
    // account,
    // address: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    // abi: artifact.abi,
    // functionName: 'viewPoints',
    // args: ['0x70997970c51812dc3a010c7d01b50e0d17dc79c8'],
    // })

    // console.log("Value: ", value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
