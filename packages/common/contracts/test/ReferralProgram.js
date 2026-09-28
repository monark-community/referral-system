// Purpose: Unit test on the ReferralProgram.sol contract
// Notes:
// - Only tests right now are for this file, but other contracts are called via ReferralProgram.sol
// - Currently (Apr-03-2026) just main sequence testing, not edge cases purely to see if the main functions are working


import test, {before, beforeEach} from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroAddress,
  stringToHex,
  decodeEventLog
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";



let publicClient;
let referrerWalletClient;
let referreeWalletClient;
let referrerAccount;
let referreeAccount;
let contractAddress;
let abi;
let hardhatProcess;
let testAccounts;
let testWalletClients;

const hardhatMnemonic = "test test test test test test test test test test test junk";

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

    // Additional funded Hardhat accounts used to construct multi-level trees.
    testAccounts = Array.from(
        { length: 7 },
        (_, addressIndex) => mnemonicToAccount(hardhatMnemonic, { addressIndex })
    );

    testWalletClients = testAccounts.map((account) => createWalletClient({
        account,
        transport: http("http://127.0.0.1:8545"),
    }));

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

test("single-referrer flow preserves results and emits listener-visible events", async () => {

    await addPointsForActions();

    const receipt = await addReferrerAndReferree();

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

    assert.equal(
        await publicClient.readContract({
            address: contractAddress,
            abi,
            functionName: "viewReferrer",
            args: [referreeAccount.address],
        }),
        referrerAccount.address
    );
    assert.equal(
        await publicClient.readContract({
            address: contractAddress,
            abi,
            functionName: "getInviteStatus",
            args: [stringToHex("invite0", { size: 32 })],
        }),
        1
    );

    // PointsAdded is declared in ReferralPoints.sol, so explicitly guard that it
    // remains part of ReferralProgram's ABI and can be decoded by API listeners.
    const pointsAddedAbi = abi.find(
        (item) => item.type === "event" && item.name === "PointsAdded"
    );
    assert.ok(pointsAddedAbi, "ReferralProgram ABI must expose PointsAdded");

    const pointsEvents = decodeReceiptEvents(receipt, "PointsAdded");
    assert.equal(pointsEvents.length, 2);
    assert.deepEqual(
        pointsEvents.map(({ args }) => ({
            user: args.user.toLowerCase(),
            points: args.points,
            isPending: args.isPending,
        })),
        [
            {
                user: referrerAccount.address.toLowerCase(),
                points: 100n,
                isPending: false,
            },
            {
                user: referreeAccount.address.toLowerCase(),
                points: 50n,
                isPending: false,
            },
        ]
    );

    const allocationEvents = decodeReceiptEvents(
        receipt,
        "ReferralPointsAllocated"
    );
    assert.equal(allocationEvents.length, 1);
    assert.deepEqual(
        {
            participant: allocationEvents[0].args.participant.toLowerCase(),
            pool: allocationEvents[0].args.pool,
            directRecipient:
                allocationEvents[0].args.directRecipient.toLowerCase(),
            directAmount: allocationEvents[0].args.directAmount,
            grandparentRecipient:
                allocationEvents[0].args.grandparentRecipient.toLowerCase(),
            grandparentAmount: allocationEvents[0].args.grandparentAmount,
            unallocatedAmount: allocationEvents[0].args.unallocatedAmount,
        },
        {
            participant: referreeAccount.address.toLowerCase(),
            pool: 100n,
            directRecipient: referrerAccount.address.toLowerCase(),
            directAmount: 100n,
            grandparentRecipient: zeroAddress,
            grandparentAmount: 0n,
            unallocatedAmount: 0n,
        }
    );
});

test("configured referral points are calculated as one pool", async () => {
    await addPointsForActions();

    const pool = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewReferralPointPool",
    });

    assert.equal(pool, 100n);
});

test("one point pool is conserved across direct and grandparent recipients", async () => {
    await addPointsForActions();
    await joinProgram(testAccounts[0], testWalletClients[0]);

    // No grandparent: the direct referrer receives the full pool.
    await acceptReferral(1, 0, "direct-only-points");
    assert.equal(await viewPoints(testAccounts[0]), 100n);
    assert.equal(await viewPoints(testAccounts[1]), 50n);

    // Both levels: the same pool is split 80/20, plus the separate user bonus.
    await acceptReferral(2, 1, "two-level-points");
    assert.equal(await viewPoints(testAccounts[0]), 120n);
    assert.equal(await viewPoints(testAccounts[1]), 130n);
    assert.equal(await viewPoints(testAccounts[2]), 50n);
});

test("allocation preview covers no parent, direct-only, and two-level cases", async () => {
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "preview-direct");
    await acceptReferral(2, 1, "preview-two-level");

    const noParent = await previewPointAllocation(testAccounts[0], 101n);
    assert.equal(noParent.directRecipient, zeroAddress);
    assert.equal(noParent.grandparentRecipient, zeroAddress);
    assert.equal(noParent.directAmount, 0n);
    assert.equal(noParent.grandparentAmount, 0n);
    assert.equal(noParent.unallocatedAmount, 101n);

    const directOnly = await previewPointAllocation(testAccounts[1], 101n);
    assert.equal(directOnly.directRecipient, testAccounts[0].address);
    assert.equal(directOnly.directAmount, 101n);
    assert.equal(directOnly.grandparentAmount, 0n);
    assert.equal(directOnly.unallocatedAmount, 0n);

    // The direct recipient receives the one-point integer division remainder.
    const twoLevel = await previewPointAllocation(testAccounts[2], 101n);
    assert.equal(twoLevel.directRecipient, testAccounts[1].address);
    assert.equal(twoLevel.grandparentRecipient, testAccounts[0].address);
    assert.equal(twoLevel.directAmount, 81n);
    assert.equal(twoLevel.grandparentAmount, 20n);
    assert.equal(twoLevel.directAmount + twoLevel.grandparentAmount, 101n);
});

test("point allocation split is configurable and must total 100 percent", async () => {
    await writeProgramContract(
        referrerAccount,
        referrerWalletClient,
        "setReferralSplit",
        [7_000, 3_000]
    );
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "custom-direct");
    await acceptReferral(2, 1, "custom-two-level");

    const allocation = await previewPointAllocation(testAccounts[2], 101n);
    assert.equal(allocation.directAmount, 71n);
    assert.equal(allocation.grandparentAmount, 30n);

    await assert.rejects(
        writeProgramContract(
            referrerAccount,
            referrerWalletClient,
            "setReferralSplit",
            [8_000, 1_000]
        )
    );
});

test("changing the point-pool configuration does not reprice prior awards", async () => {
    await addPointsForActions();
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "first-priced-referral");
    assert.equal(await viewPoints(testAccounts[0]), 100n);

    await writeProgramContract(
        referrerAccount,
        referrerWalletClient,
        "setPointsForAction",
        [0, 200]
    );
    assert.equal(await viewPoints(testAccounts[0]), 100n);

    await acceptReferral(2, 0, "second-priced-referral");
    assert.equal(await viewPoints(testAccounts[0]), 300n);
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

test("viewAllReferrals returns an empty list when a user has no referrees", async () => {
    const referrals = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAllReferrals",
        args: [testAccounts[0].address],
    });

    assert.deepEqual(referrals, []);
});

test("viewAncestors fills missing parent and grandparent positions with the zero address", async () => {
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "one-level-invite");

    const rootAncestors = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAncestors",
        args: [testAccounts[0].address],
    });

    const directReferreeAncestors = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAncestors",
        args: [testAccounts[1].address],
    });

    assert.deepEqual(rootAncestors, [zeroAddress, zeroAddress]);
    assert.deepEqual(directReferreeAncestors, [
        testAccounts[0].address,
        zeroAddress,
    ]);
});

test("two-level referral flow returns the parent, grandparent, and both referral levels", async () => {
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "level-one-invite");
    await acceptReferral(2, 1, "level-two-invite");

    const ancestors = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAncestors",
        args: [testAccounts[2].address],
    });

    const referrals = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAllReferrals",
        args: [testAccounts[0].address],
    });

    assert.deepEqual(ancestors, [
        testAccounts[1].address,
        testAccounts[0].address,
    ]);
    assert.equal(referrals.length, 2);
    assert.deepEqual(referralLevelsByAddress(referrals), {
        [testAccounts[1].address.toLowerCase()]: 1,
        [testAccounts[2].address.toLowerCase()]: 2,
    });
});

test("viewAllReferrals handles branches and excludes referrees below level two", async () => {
    await buildBranchedReferralTree();

    const rootReferrals = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAllReferrals",
        args: [testAccounts[0].address],
    });

    assert.equal(rootReferrals.length, 5);
    assert.deepEqual(referralLevelsByAddress(rootReferrals), {
        [testAccounts[1].address.toLowerCase()]: 1,
        [testAccounts[2].address.toLowerCase()]: 1,
        [testAccounts[3].address.toLowerCase()]: 2,
        [testAccounts[4].address.toLowerCase()]: 2,
        [testAccounts[5].address.toLowerCase()]: 2,
    });
    assert.equal(
        referralLevelsByAddress(rootReferrals)[testAccounts[6].address.toLowerCase()],
        undefined
    );

    // Levels are relative to the user being viewed. The third-level referree
    // from the root's perspective is a second-level referree of account 1.
    const branchReferrals = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAllReferrals",
        args: [testAccounts[1].address],
    });

    assert.equal(branchReferrals.length, 3);
    assert.deepEqual(referralLevelsByAddress(branchReferrals), {
        [testAccounts[3].address.toLowerCase()]: 1,
        [testAccounts[4].address.toLowerCase()]: 1,
        [testAccounts[6].address.toLowerCase()]: 2,
    });
});

test("viewAncestors returns only the immediate parent and grandparent in a deeper referral tree", async () => {
    await buildBranchedReferralTree();

    const ancestors = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewAncestors",
        args: [testAccounts[6].address],
    });

    assert.deepEqual(ancestors, [
        testAccounts[3].address,
        testAccounts[1].address,
    ]);
    assert.equal(ancestors.includes(testAccounts[0].address), false);
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

    assert.equal(userinvites.length, 4);

    // invite from accepting invite
    assert.equal(userinvites[0].inviteId, stringToHex("invite0", {size: 32}));
    assert.equal(userinvites[0].status, 1); // accepted
    assert.equal(userinvites[0].points, 100n); // points for referring


    //Added invites
    assert.equal(userinvites[1].inviteId, stringToHex("invite1", {size: 32}));
    assert.equal(userinvites[1].status, 0); // pending 
    assert.equal(userinvites[1].points, 100n); // points for referring

    assert.equal(userinvites[2].inviteId, stringToHex("invite2", {size: 32}));
    assert.equal(userinvites[2].status, 1); // accepted 
    assert.equal(userinvites[2].points, 100n); // points for referring

    assert.equal(userinvites[3].inviteId, stringToHex("invite3", {size: 32}));
    assert.equal(userinvites[3].status, 2); // closed 
    assert.equal(userinvites[3].points, 100n); // points for referring

    const userPendingPoints = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewPoints",
        args: [referrerAccount.address],
    });

    assert.equal(userPendingPoints, 100n);
    
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

    assert.equal(userinvites.length, 4);

    assert.equal(userinvites[1].inviteId, stringToHex("invite1", {size: 32}));
    assert.equal(userinvites[1].status, 0); // pending 
    assert.equal(userinvites[1].points, 100n); // points for referring

    let request;

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "updateInviteStatus",
        args: [userinvites[1].inviteId, 1], // update invite status to accepted
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    const newStatus = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getInviteStatus",
        args: [userinvites[1].inviteId],
    });

    assert.equal(newStatus, 1); // status should be accepted now
    
});



/*Helper functions that complete common functions in many tests*/

async function writeProgramContract(account, walletClient, functionName, args = []) {
    const { request } = await publicClient.simulateContract({
        account,
        address: contractAddress,
        abi,
        functionName,
        args,
    });

    const hash = await walletClient.writeContract(request);
    return publicClient.waitForTransactionReceipt({ hash });
}

async function joinProgram(account, walletClient) {
    await writeProgramContract(account, walletClient, "joinProgram");
}

async function acceptReferral(referreeIndex, referrerIndex, inviteName) {
    await writeProgramContract(
        testAccounts[referreeIndex],
        testWalletClients[referreeIndex],
        "acceptInvite",
        [
            testAccounts[referrerIndex].address,
            stringToHex(inviteName, { size: 32 }),
        ]
    );
}

async function buildBranchedReferralTree() {
    await joinProgram(testAccounts[0], testWalletClients[0]);
    await acceptReferral(1, 0, "root-to-one");
    await acceptReferral(2, 0, "root-to-two");
    await acceptReferral(3, 1, "one-to-three");
    await acceptReferral(4, 1, "one-to-four");
    await acceptReferral(5, 2, "two-to-five");
    await acceptReferral(6, 3, "three-to-six");
}

function referralLevelsByAddress(referrals) {
    return Object.fromEntries(referrals.map(({ referral, level }) => [
        referral.toLowerCase(),
        level,
    ]));
}

function decodeReceiptEvents(receipt, eventName) {
    return receipt.logs.flatMap((log) => {
        try {
            const decoded = decodeEventLog({
                abi,
                data: log.data,
                topics: log.topics,
            });
            return decoded.eventName === eventName ? [decoded] : [];
        } catch {
            return [];
        }
    });
}

async function viewPoints(account) {
    return publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "viewPoints",
        args: [account.address],
    });
}

async function previewPointAllocation(account, pointPool) {
    return publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "previewReferralPointAllocation",
        args: [account.address, pointPool],
    });
}

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
        args: [referrerAccount.address, stringToHex("invite0", {size: 32})],
    }))
    hash = await referreeWalletClient.writeContract(request)
    return publicClient.waitForTransactionReceipt({ hash });

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
        args: [stringToHex("invite1", {size: 32}), referrerAccount.address, 0], // add a invite with status pending
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "createInvite",
        args: [stringToHex("invite2", {size: 32}), referrerAccount.address, 1], // add a invite with status Accepted
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });

    ({ request } = await publicClient.simulateContract({
        account: referrerAccount,
        address: contractAddress,
        abi: abi,
        functionName: "createInvite",
        args: [stringToHex("invite3", {size: 32}), referrerAccount.address, 2], // add a invite with status Closed
    }))
    var hash = await referreeWalletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash });
}
