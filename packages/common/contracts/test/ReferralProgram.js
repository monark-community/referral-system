import test, {before, beforeEach} from "node:test";
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

});

beforeEach(async () => {

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

test("User has a default of zero points", async () => {
    const value = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "viewPoints",
    });

    assert.equal(value, 0n);
});

test("User has a default milestone of zero", async () => {
    const value = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
    });

    assert.equal(value, 0n);
});

test("points can be added to an account", async () => {

    await addPointsForActions();

    await addReferrerAndReferree();

    const referrerPoints = await publicClient.readContract({
        account: referrerAccount,
        address: contractAddress,
        abi,
        functionName: "viewPoints",
    });

    assert.equal(referrerPoints, 100n); // referrer has 100 points after referral 

    const referreePoints = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "viewPoints",
    });

    assert.equal(referreePoints, 50n); // referree has 50 points after referral
});

test("accepting invite adds a referrer-referree relationship", async () => {

    await addReferrerAndReferree();

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

test("user achieves a milestone", async () => {

    await addPointsForActions();

    await setMilestones()

    await addReferrerAndReferree();

    const referrerMilestone = await publicClient.readContract({
        account: referrerAccount,
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
    });

    assert.equal(referrerMilestone, 2n); // referrer has crossed the second milestone (100 points) after referring 

    const referreeMilestone = await publicClient.readContract({
        account: referreeAccount,
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
    });

    assert.equal(referreeMilestone, 1n); // referree has crossed the first milestone (25 points) after referring 
});



/*Helper functions that complete common functions in many tests*/

async function addReferrerAndReferree(){
    let request;

    // joinProgram
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "joinProgram",
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    // acceptInvite
    ({ request } = await publicClient.simulateContract({
        account: referreeAccount,
        address: contractAddress,
        abi: abi,
        functionName: "acceptInvite",
        args: [referrerAccount.address],
    }))
    hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

}

async function addPointsForActions() {
    let request;
    // set points for referring someone
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "setPointsForAction",
        args: [0, 100], // args mean for action 0 (referring) you get 100 points
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    // set points for accepting invite
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "setPointsForAction",
        args: [1, 50], // args mean for action 0 (referring) you get 100 points
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });
}

async function setMilestones(){
    let request;
    // set the milestone amounts
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "addNewMilestone",
        args: [25], // add a new milestone at 25 points
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "addNewMilestone",
        args: [100], // add a new milestone at 100 points
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });
}
