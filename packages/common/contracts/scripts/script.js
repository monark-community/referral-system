import hre from "hardhat";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import artifact from "../artifacts/contracts/ReferralProgram.sol/ReferralProgram.json"

//manual test script allowing you to interact with the contract

async function main() {
  // Hardhat local private key (account #0)
  const account = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  );

  const publicClient = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });

  const walletClient = createWalletClient({
    account,
    transport: http("http://127.0.0.1:8545"),
  });

//   const hash = await walletClient.writeContract({ 
//     account,
//     address: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
//     abi: artifact.abi,
//     functionName: 'acceptInvite',
//     args: ['0x70997970c51812dc3a010c7d01b50e0d17dc79c8'],
//     })

    const value = await publicClient.readContract({ 
    account,
    address: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    abi: artifact.abi,
    functionName: 'viewReferrals',
    })

    console.log("Value: ", value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
