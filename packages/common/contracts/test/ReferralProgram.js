import test, {before} from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";



let publicClient;
let referrerWalletClient;
let referreeWalletClient;
let referrerAccount;
let referreeAccount;
let contractAddress;
let abi;
let hardhatProcess;

before(async () => {

    // Hardhat default account #0
    referrerAccount = privateKeyToAccount(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );

    // Hardhat default account #1
    referreeAccount = privateKeyToAccount(
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );

    publicClient = createPublicClient({
        transport: http("http://127.0.0.1:8545"),
    });

    referrerWalletClient = createWalletClient({
        account: referrerAccount,
        transport: http("http://127.0.0.1:8545"),
    });

    referreeWalletClient = createWalletClient({
        account: referreeAccount,
        transport: http("http://127.0.0.1:8545"),
    });

    // Compile + load ABI
    const artifact = await hre.artifacts.readArtifact("ReferralProgram");
    abi = artifact.abi;

    // Deploy
    const hash = await referrerWalletClient.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    contractAddress = receipt.contractAddress;
});

test("Referee has a default referrer empty", async () => {
    const value = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "viewReferrer",
    });

    assert.equal(value, zeroAddress);
});

test("accepting invite adds a referrer-referree relationship", async () => {
    const hash = await referreeWalletClient.writeContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "acceptInvite",
        args: [referrerAccount.address],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    const referrerValue = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "viewReferrer",
    });

    assert.equal(referrerValue, referrerAccount.address);

    const referreeValues = await publicClient.readContract({
        account: referrerAccount,
        address: contractAddress,
        abi,
        functionName: "viewReferrals",
    });

    assert.equal(referreeValues[0], referreeAccount.address);
});


