import test, {before, beforeEach} from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
  stringToHex
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
        address: contractAddress,
        abi,
        functionName: "viewReferrer",
        args: [referreeAccount.address],
    });

    assert.equal(value, zeroAddress);
});

test("User has a default of zero points", async () => {
    const value = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewPoints",
        args: [referreeAccount.address],
    });

    assert.equal(value, 0n);
});

test("User has a default milestone of zero", async () => {
    const value = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
        args: [referreeAccount.address],
    });

    assert.equal(value, 0n);
});

test("points can be added to an account", async () => {

    await addPointsForActions();

    await addReferrerAndReferree();

    const referrerPoints = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewPoints",
        args: [referrerAccount.address],
    });

    assert.equal(referrerPoints, 100n); // referrer has 100 points after referral 

    const referreePoints = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewPoints",
        args: [referreeAccount.address],
    });

    assert.equal(referreePoints, 50n); // referree has 50 points after referral
});

test("accepting invite adds a referrer-referree relationship", async () => {

    await addReferrerAndReferree();

    const referrerValue = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewReferrer",
        args: [referreeAccount.address],
    });

    assert.equal(referrerValue, referrerAccount.address);

    const referreeValues = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewReferrals",
        args: [referrerAccount.address],
    });

    assert.equal(referreeValues[0], referreeAccount.address);
});

test("user achieves a milestone", async () => {

    await addPointsForActions();

    await setMilestones()

    await addReferrerAndReferree();

    const referrerMilestone = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
        args: [referrerAccount.address],
    });

    assert.equal(referrerMilestone, 2n); // referrer has crossed the second milestone (100 points) after referring 

    const referreeMilestone = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getCurrentUserMilestone",
        args: [referreeAccount.address],
    });

    assert.equal(referreeMilestone, 1n); // referree has crossed the first milestone (25 points) after referring 
});

test("user can have have a invite created", async () => {
    await addPointsForActions();

    await setMilestones()

    await addReferrerAndReferree();

    await createInvitesForUser(referrerAccount);

    const userinvites = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getReferrerInvites",
        args: [referrerAccount.address],
    });

    assert.equal(userinvites.length, 3);

    assert.equal(userinvites[0].inviteId, stringToHex("invite1", {size: 32}));
    assert.equal(userinvites[0].status, 0); // pending 
    assert.equal(userinvites[0].points, 100n); // points for referring

    assert.equal(userinvites[1].inviteId, stringToHex("invite2", {size: 32}));
    assert.equal(userinvites[1].status, 1); // accepted 
    assert.equal(userinvites[1].points, 100n); // points for referring

    assert.equal(userinvites[2].inviteId, stringToHex("invite3", {size: 32}));
    assert.equal(userinvites[2].status, 2); // closed 
    assert.equal(userinvites[2].points, 100n); // points for referring
    
});

test("user invite status can be updated", async () => {
    await addPointsForActions();

    await setMilestones()

    await addReferrerAndReferree();

    await createInvitesForUser(referrerAccount);

    const userinvites = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getReferrerInvites",
        args: [referrerAccount.address],
    });

    assert.equal(userinvites.length, 3);

    assert.equal(userinvites[0].inviteId, stringToHex("invite1", {size: 32}));
    assert.equal(userinvites[0].status, 0); // pending 
    assert.equal(userinvites[0].points, 100n); // points for referring

    let request;

    // joinProgram
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "updateInviteStatus",
        args: [userinvites[0].inviteId, 1], // update invite status to accepted
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    const newStatus = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getInviteStatus",
        args: [userinvites[0].inviteId],
    });

    assert.equal(newStatus, 1); // status should be accepted now
    
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

async function createInvitesForUser(user) {
    let request;
    // set the milestone amounts
    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "createInvite",
        args: [stringToHex("invite1", {size: 32}), 0], // add a invite with status pending
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "createInvite",
        args: [stringToHex("invite2", {size: 32}), 1], // add a invite with status Accepted
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "createInvite",
        args: [stringToHex("invite3", {size: 32}), 2], // add a invite with status Closed
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });
}
