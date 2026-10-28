// Purpose: Tests the generalized campaign surface exposed by ReferralProgram.

import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    decodeErrorResult,
    decodeEventLog,
    encodeErrorResult,
    http,
    stringToHex,
    zeroAddress,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const hardhatMnemonic =
    "test test test test test test test test test test test junk";

let publicClient;
let admin;
let owner;
let participant;
let other;
let parent;
let grandparent;
let adminWallet;
let ownerWallet;
let participantWallet;
let parentWallet;
let grandparentWallet;
let referralAddress;
let referralAbi;

const campaignId = stringToHex("campaign-facade", { size: 32 });
const fulfillmentId = stringToHex("fulfillment-facade", { size: 32 });
const secondCampaignId = stringToHex("campaign-facade-2", { size: 32 });
const secondFulfillmentId = stringToHex("fulfillment-facade-2", { size: 32 });
// RewardType.Points, then 30 points for the completer and a 10-point referral pool
const pointsReward = [0, 30, 10];
const MAX_POINTS_PER_COMPLETION = 1000;
const MAX_DIRECT_REWARD_PER_COMPLETION = 1000;

before(async () => {
    // Test files run at the same time against one Hardhat node, so each file signs with its own accounts;
    // sharing one would make their transactions collide on the account's nonce
    [admin, owner, participant, other, parent, grandparent] = [14, 15, 16, 17, 18, 19].map((addressIndex) =>
        mnemonicToAccount(hardhatMnemonic, { addressIndex }),
    );
    publicClient = createPublicClient({
        transport: http("http://127.0.0.1:8545"),
    });
    adminWallet = createWalletClient({
        account: admin,
        transport: http("http://127.0.0.1:8545"),
    });
    ownerWallet = createWalletClient({
        account: owner,
        transport: http("http://127.0.0.1:8545"),
    });
    participantWallet = createWalletClient({
        account: participant,
        transport: http("http://127.0.0.1:8545"),
    });
    parentWallet = createWalletClient({
        account: parent,
        transport: http("http://127.0.0.1:8545"),
    });
    grandparentWallet = createWalletClient({
        account: grandparent,
        transport: http("http://127.0.0.1:8545"),
    });
});

beforeEach(async () => {
    const referralArtifact = await hre.artifacts.readArtifact("ReferralProgram");
    referralAbi = referralArtifact.abi;

    const hash = await adminWallet.deployContract({
        abi: referralAbi,
        bytecode: referralArtifact.bytecode,
        args: [],
    });
    const referralReceipt = await publicClient.waitForTransactionReceipt({ hash });
    referralAddress = referralReceipt.contractAddress;

    await writeFacade(admin, adminWallet, "setMaxCampaignPointsPerCompletion", [
        MAX_POINTS_PER_COMPLETION,
    ]);
    await writeFacade(admin, adminWallet, "setMaxCampaignDirectRewardPerCompletion", [
        MAX_DIRECT_REWARD_PER_COMPLETION,
    ]);
});

async function writeFacade(account, wallet, functionName, args, value) {
    const { request, result } = await publicClient.simulateContract({
        account,
        address: referralAddress,
        abi: referralAbi,
        functionName,
        args,
        ...(value === undefined ? {} : { value }),
    });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { result, receipt };
}

// decodeEventLog ignores an eventName argument and decodes each log as whichever event it is,
// so the name is checked here
function eventsFrom(receipt, eventName) {
    return receipt.logs.flatMap((log) => {
        try {
            const decoded = decodeEventLog({ abi: referralAbi, data: log.data, topics: log.topics });
            return decoded.eventName === eventName ? [decoded] : [];
        } catch {
            // Logs from other contracts in the same transaction
            return [];
        }
    });
}

function eventFrom(receipt, eventName) {
    const [event] = eventsFrom(receipt, eventName);
    if (!event) assert.fail(`${eventName} was not emitted`);
    return event;
}

async function createCampaign(reward = pointsReward, value) {
    // TaskType.Bounty = 1 and VerificationType.Manual = 1
    return writeFacade(owner, ownerWallet, "createCampaign", [campaignId, 1, 1, ...reward], value);
}

async function joinProgram(account, wallet) {
    return writeFacade(account, wallet, "joinProgram", []);
}

async function acceptInvite(account, wallet, referrer, inviteName) {
    return writeFacade(account, wallet, "acceptInvite", [
        referrer.address,
        stringToHex(inviteName, { size: 32 }),
    ]);
}

async function verify() {
    return writeFacade(owner, ownerWallet, "verifyCampaignFulfillment", [fulfillmentId]);
}

async function pointsOf(account) {
    return publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "viewPoints",
        args: [account.address],
    });
}

async function directRewardsOf(account) {
    return publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "directRewardBalances",
        args: [account.address],
    });
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function submitFulfillment() {
    return writeFacade(
        participant,
        participantWallet,
        "submitCampaignFulfillment",
        [campaignId, fulfillmentId],
    );
}

test("facade ABI exposes campaign errors, events, and object returns", () => {
    const constructor = referralAbi.find(({ type }) => type === "constructor");
    assert.deepEqual(constructor.inputs, []);
    assert.equal(
        referralAbi.some(
            (item) => item.type === "function" && item.name === "campaigns",
        ),
        false,
        "the internal Campaigns module must not become an application ABI boundary",
    );

    const errorNames = referralAbi
        .filter(({ type }) => type === "error")
        .map(({ name }) => name);
    for (const name of [
        "CampaignAlreadyExists",
        "CampaignNotFound",
        "FulfillmentAlreadyExists",
        "InvalidFulfillmentStatus",
        "ParticipantAlreadySubmitted",
        "UnauthorizedManualVerifier",
        "UnsupportedCampaignCombination",
        "ZeroCampaignId",
        "ZeroFulfillmentId",
        "CampaignOwnerCannotParticipate",
        "CampaignRewardAboveMaximum",
        "ZeroCampaignReward",
        "NoDirectRewards",
        "ZeroWithdrawalDestination",
        "DirectPaymentFailed",
    ]) {
        assert.ok(errorNames.includes(name), `${name} missing from facade ABI`);
    }
    const encodedError = encodeErrorResult({
        abi: referralAbi,
        errorName: "CampaignAlreadyExists",
        args: [campaignId],
    });
    assert.deepEqual(decodeErrorResult({ abi: referralAbi, data: encodedError }), {
        abiItem: referralAbi.find(
            (item) =>
                item.type === "error" && item.name === "CampaignAlreadyExists",
        ),
        args: [campaignId],
        errorName: "CampaignAlreadyExists",
    });

    const eventNames = referralAbi
        .filter(({ type }) => type === "event")
        .map(({ name }) => name);
    assert.ok(eventNames.includes("CampaignCreated"));
    assert.ok(eventNames.includes("CampaignFulfillmentSubmitted"));
    assert.ok(eventNames.includes("CampaignFulfillmentVerified"));
    assert.ok(eventNames.includes("CampaignFulfillmentRejected"));
    assert.ok(eventNames.includes("CampaignRewardPaid"));
    assert.ok(eventNames.includes("DirectRewardAccrued"));
    assert.ok(eventNames.includes("DirectRewardsWithdrawn"));

    for (const name of [
        "createCampaign",
        "submitCampaignFulfillment",
        "verifyCampaignFulfillment",
        "rejectCampaignFulfillment",
    ]) {
        const entry = referralAbi.find(
            (item) => item.type === "function" && item.name === name,
        );
        assert.equal(entry.outputs.length, 1);
        assert.equal(entry.outputs[0].type, "tuple");
    }
});

test("creates a campaign for the calling owner and returns its object", async () => {
    const { result, receipt } = await createCampaign();
    assert.equal(result.id, campaignId);
    assert.equal(result.owner.toLowerCase(), owner.address.toLowerCase());
    assert.equal(result.taskType, 1);
    assert.equal(result.verificationType, 1);
    assert.equal(result.status, 1);
    assert.equal(result.rewardType, 0);
    assert.equal(result.completerReward, 30n);
    assert.equal(result.referralPool, 10n);

    const created = eventFrom(receipt, "CampaignCreated");
    assert.equal(created.args.campaignId, campaignId);
    assert.equal(created.args.owner.toLowerCase(), owner.address.toLowerCase());
    assert.equal(created.args.taskType, 1);
    assert.equal(created.args.verificationType, 1);
    assert.equal(created.args.rewardType, 0);
    assert.equal(created.args.completerReward, 30n);
    assert.equal(created.args.referralPool, 10n);

    const stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaign",
        args: [campaignId],
    });
    assert.deepEqual(stored, result);
});

test("a direct campaign stays pending until funding covers at least one complete run", async () => {
    const { result: created } = await createCampaign([1, 30, 10], 20n);
    assert.equal(created.status, 3); // PendingFunding
    assert.equal(created.balance, 20n);

    await assert.rejects(
        publicClient.simulateContract({
            account: participant,
            address: referralAddress,
            abi: referralAbi,
            functionName: "submitCampaignFulfillment",
            args: [campaignId, fulfillmentId],
        }),
    );

    const { result: runsAfterFirstFunding } = await writeFacade(
        owner,
        ownerWallet,
        "fundCampaign",
        [campaignId],
        10n,
    );
    assert.equal(runsAfterFirstFunding, 0n);

    let stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaign",
        args: [campaignId],
    });
    assert.equal(stored.status, 3);
    assert.equal(stored.balance, 30n);

    const { result: runsAfterSecondFunding } = await writeFacade(
        owner,
        ownerWallet,
        "fundCampaign",
        [campaignId],
        50n,
    );
    assert.equal(runsAfterSecondFunding, 2n);

    stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaign",
        args: [campaignId],
    });
    assert.equal(stored.status, 1); // Active
    assert.equal(stored.balance, 80n);

    const { result: fulfillment } = await submitFulfillment();
    assert.equal(fulfillment.status, 1);
});

test("rejects native currency for points campaigns and rejects zero-value rewards", async () => {
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "createCampaign",
            args: [campaignId, 1, 1, ...pointsReward],
            value: 1n,
        }),
    );
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "createCampaign",
            args: [campaignId, 1, 1, 1, 0, 0],
        }),
    );

    const { result } = await createCampaign();
    assert.equal(result.status, 1);
});

test("submits from the calling participant and returns its object", async () => {
    await createCampaign();
    const { result, receipt } = await submitFulfillment();
    assert.equal(result.id, fulfillmentId);
    assert.equal(result.campaignId, campaignId);
    assert.equal(result.participant.toLowerCase(), participant.address.toLowerCase());
    assert.equal(result.status, 1);

    const submitted = eventFrom(receipt, "CampaignFulfillmentSubmitted");
    assert.equal(submitted.args.campaignId, campaignId);
    assert.equal(submitted.args.fulfillmentId, fulfillmentId);
    assert.equal(
        submitted.args.participant.toLowerCase(),
        participant.address.toLowerCase(),
    );
    assert.equal(submitted.args.taskType, 1);

    const stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getParticipantCampaignFulfillment",
        args: [campaignId, participant.address],
    });
    assert.deepEqual(stored, result);
});

test("manual verification uses the calling owner and returns verified state", async () => {
    await createCampaign();
    await submitFulfillment();

    await assert.rejects(
        publicClient.simulateContract({
            account: other,
            address: referralAddress,
            abi: referralAbi,
            functionName: "verifyCampaignFulfillment",
            args: [fulfillmentId],
        }),
    );

    const { result, receipt } = await writeFacade(
        owner,
        ownerWallet,
        "verifyCampaignFulfillment",
        [fulfillmentId],
    );
    assert.equal(result.status, 2);

    const verified = eventFrom(receipt, "CampaignFulfillmentVerified");
    assert.equal(verified.args.campaignId, campaignId);
    assert.equal(verified.args.fulfillmentId, fulfillmentId);
    assert.equal(verified.args.verifier.toLowerCase(), owner.address.toLowerCase());
    assert.equal(
        verified.args.participant.toLowerCase(),
        participant.address.toLowerCase(),
    );
    assert.equal(verified.args.verificationType, 1);

    const stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaignFulfillment",
        args: [fulfillmentId],
    });
    assert.deepEqual(stored, result);
});

test("facade rejects duplicate and repeat transitions", async () => {
    await createCampaign();
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "createCampaign",
            args: [campaignId, 1, 1, ...pointsReward],
        }),
    );

    await submitFulfillment();
    await assert.rejects(
        publicClient.simulateContract({
            account: participant,
            address: referralAddress,
            abi: referralAbi,
            functionName: "submitCampaignFulfillment",
            args: [campaignId, stringToHex("fulfillment-repeat", { size: 32 })],
        }),
    );

    await writeFacade(owner, ownerWallet, "verifyCampaignFulfillment", [
        fulfillmentId,
    ]);
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "verifyCampaignFulfillment",
            args: [fulfillmentId],
        }),
    );
});

// ---------- Paying a verified completion ----------
// The local node reports every revert as "Internal error" without the error's data, so each refusal
// below is paired with the same call succeeding once only the condition under test changes

async function submitAndVerify() {
    await createCampaign();
    await submitFulfillment();
    return (await verify()).receipt;
}

function rewardPaid(receipt) {
    const paid = eventsFrom(receipt, "CampaignRewardPaid");
    assert.equal(paid.length, 1);
    return paid[0].args;
}

test("verifying pays the completer and splits the pool 80/20 between their referrer and grandparent", async () => {
    // grandparent -> parent -> participant
    await joinProgram(grandparent, grandparentWallet);
    await acceptInvite(parent, parentWallet, grandparent, "grandparent-to-parent");
    await acceptInvite(participant, participantWallet, parent, "parent-to-participant");

    const receipt = await submitAndVerify();

    assert.equal(await pointsOf(participant), 30n);
    assert.equal(await pointsOf(parent), 8n);
    assert.equal(await pointsOf(grandparent), 2n);

    const paid = rewardPaid(receipt);
    assert.equal(paid.campaignId, campaignId);
    assert.equal(paid.fulfillmentId, fulfillmentId);
    assert.ok(same(paid.participant, participant.address));
    assert.equal(paid.rewardType, 0);
    assert.equal(paid.completerReward, 30n);
    assert.equal(paid.referralPool, 10n);
    assert.ok(same(paid.referralPayout.directRecipient, parent.address));
    assert.ok(same(paid.referralPayout.grandparentRecipient, grandparent.address));
    assert.equal(paid.referralPayout.directAmount, 8n);
    assert.equal(paid.referralPayout.grandparentAmount, 2n);
    assert.equal(paid.referralPayout.unallocatedAmount, 0n);

    // Each balance change is announced like any other, and nothing claims to be a sign-up
    const balances = eventsFrom(receipt, "PointsAdded").map(({ args }) => [args.user.toLowerCase(), args.points]);
    assert.deepEqual(balances, [
        [participant.address.toLowerCase(), 30n],
        [parent.address.toLowerCase(), 8n],
        [grandparent.address.toLowerCase(), 2n],
    ]);
    assert.equal(eventsFrom(receipt, "ReferralPointsAllocated").length, 0);
});

test("a direct campaign accrues native rewards for the completer and their ancestors", async () => {
    // grandparent -> parent -> participant
    await joinProgram(grandparent, grandparentWallet);
    await acceptInvite(parent, parentWallet, grandparent, "grandparent-to-parent");
    await acceptInvite(participant, participantWallet, parent, "parent-to-participant");

    const participantPointsBefore = await pointsOf(participant);
    const parentPointsBefore = await pointsOf(parent);
    const grandparentPointsBefore = await pointsOf(grandparent);

    // RewardType.Direct = 1, with 30 wei for the completer and a 10 wei referral pool.
    await createCampaign([1, 30, 10], 40n);
    await submitFulfillment();
    const participantBalanceBefore = await publicClient.getBalance({ address: participant.address });
    const parentBalanceBefore = await publicClient.getBalance({ address: parent.address });
    const grandparentBalanceBefore = await publicClient.getBalance({ address: grandparent.address });
    const receipt = (await verify()).receipt;

    // Verification has no external ETH calls; it only moves campaign funds into user balances.
    assert.equal(await publicClient.getBalance({ address: participant.address }), participantBalanceBefore);
    assert.equal(await publicClient.getBalance({ address: parent.address }), parentBalanceBefore);
    assert.equal(await publicClient.getBalance({ address: grandparent.address }), grandparentBalanceBefore);
    assert.equal(await directRewardsOf(participant), 30n);
    assert.equal(await directRewardsOf(parent), 8n);
    assert.equal(await directRewardsOf(grandparent), 2n);
    assert.equal(await pointsOf(participant), participantPointsBefore);
    assert.equal(await pointsOf(parent), parentPointsBefore);
    assert.equal(await pointsOf(grandparent), grandparentPointsBefore);

    const paid = rewardPaid(receipt);
    assert.equal(paid.rewardType, 1);
    assert.equal(paid.referralPayout.rewardType, 1);
    assert.equal(paid.referralPayout.campaignId, campaignId);

    const accrued = eventsFrom(receipt, "DirectRewardAccrued").map(({ args }) => [
        args.account.toLowerCase(),
        args.amount,
        args.balance,
    ]);
    assert.deepEqual(accrued, [
        [participant.address.toLowerCase(), 30n, 30n],
        [parent.address.toLowerCase(), 8n, 8n],
        [grandparent.address.toLowerCase(), 2n, 2n],
    ]);

    const stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaign",
        args: [campaignId],
    });
    assert.equal(stored.balance, 0n);
    assert.equal(stored.status, 3); // PendingFunding
});

test("direct rewards accumulate and the owner withdraws the whole balance once", async () => {
    await createCampaign([1, 30, 10], 40n);
    await submitFulfillment();
    await verify();

    await writeFacade(
        owner,
        ownerWallet,
        "createCampaign",
        [secondCampaignId, 1, 1, 1, 30, 10],
        40n,
    );
    await writeFacade(
        participant,
        participantWallet,
        "submitCampaignFulfillment",
        [secondCampaignId, secondFulfillmentId],
    );
    await writeFacade(
        owner,
        ownerWallet,
        "verifyCampaignFulfillment",
        [secondFulfillmentId],
    );

    assert.equal(await directRewardsOf(participant), 60n);

    // Another address cannot withdraw the participant's balance.
    await assert.rejects(
        publicClient.simulateContract({
            account: other,
            address: referralAddress,
            abi: referralAbi,
            functionName: "withdrawDirectRewards",
            args: [other.address],
        }),
    );

    // A bad destination only rejects this withdrawal; verification and the accrued balance survive.
    await assert.rejects(
        participantWallet.writeContract({
            address: referralAddress,
            abi: referralAbi,
            functionName: "withdrawDirectRewards",
            args: [referralAddress],
            gas: 150_000n,
        }),
    );
    await assert.rejects(
        publicClient.simulateContract({
            account: participant,
            address: referralAddress,
            abi: referralAbi,
            functionName: "withdrawDirectRewards",
            args: [zeroAddress],
        }),
    );
    assert.equal(await directRewardsOf(participant), 60n);

    const destinationBalanceBefore = await publicClient.getBalance({ address: other.address });
    const { result, receipt } = await writeFacade(
        participant,
        participantWallet,
        "withdrawDirectRewards",
        [other.address],
    );
    assert.equal(result, 60n);
    assert.equal(await directRewardsOf(participant), 0n);
    assert.equal(
        await publicClient.getBalance({ address: other.address }),
        destinationBalanceBefore + 60n,
    );

    const withdrawn = eventFrom(receipt, "DirectRewardsWithdrawn");
    assert.ok(same(withdrawn.args.account, participant.address));
    assert.ok(same(withdrawn.args.destination, other.address));
    assert.equal(withdrawn.args.amount, 60n);

    await assert.rejects(
        publicClient.simulateContract({
            account: participant,
            address: referralAddress,
            abi: referralAbi,
            functionName: "withdrawDirectRewards",
            args: [other.address],
        }),
    );
});

test("a referrer without a referrer of their own gets the whole pool", async () => {
    await joinProgram(parent, parentWallet);
    await acceptInvite(participant, participantWallet, parent, "parent-to-participant");

    const paid = rewardPaid(await submitAndVerify());

    assert.equal(await pointsOf(participant), 30n);
    assert.equal(await pointsOf(parent), 10n);
    assert.equal(paid.referralPayout.directAmount, 10n);
    assert.equal(paid.referralPayout.grandparentAmount, 0n);
});

test("a completer who joined without an invite still gets their reward, and no pool is paid", async () => {
    await joinProgram(participant, participantWallet);

    const paid = rewardPaid(await submitAndVerify());

    assert.equal(await pointsOf(participant), 30n);
    assert.equal(paid.referralPayout.directRecipient, zeroAddress);
    assert.equal(paid.referralPayout.directAmount, 0n);
    assert.equal(paid.referralPayout.unallocatedAmount, 10n);
});

test("the creator earns no referral points from their own campaign", async () => {
    // grandparent -> owner -> participant: the owner's 80% stays unpaid, the grandparent still gets 20%
    await joinProgram(grandparent, grandparentWallet);
    await acceptInvite(owner, ownerWallet, grandparent, "grandparent-to-owner");
    await acceptInvite(participant, participantWallet, owner, "owner-to-participant");

    const paid = rewardPaid(await submitAndVerify());

    assert.equal(await pointsOf(participant), 30n);
    assert.equal(await pointsOf(owner), 0n);
    assert.equal(await pointsOf(grandparent), 2n);
    assert.ok(same(paid.referralPayout.directRecipient, owner.address));
    assert.equal(paid.referralPayout.directAmount, 0n);
    assert.equal(paid.referralPayout.grandparentAmount, 2n);
    assert.equal(paid.referralPayout.unallocatedAmount, 8n);
});

test("the creator cannot complete their own campaign", async () => {
    await createCampaign();

    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "submitCampaignFulfillment",
            args: [campaignId, fulfillmentId],
        }),
    );
    // The same submission from anyone else goes through
    const { result } = await submitFulfillment();
    assert.equal(result.status, 1);
});

test("approving again pays nothing", async () => {
    await submitAndVerify();

    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "verifyCampaignFulfillment",
            args: [fulfillmentId],
        }),
    );
    assert.equal(await pointsOf(participant), 30n);
});

test("only an admin sets the most points one completion can pay, and campaigns above it are refused", async () => {
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "setMaxCampaignPointsPerCompletion",
            args: [1],
        }),
    );

    // 30 + 10 is 40 points per completion
    await writeFacade(admin, adminWallet, "setMaxCampaignDirectRewardPerCompletion", [0]);
    await writeFacade(admin, adminWallet, "setMaxCampaignPointsPerCompletion", [39]);
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "createCampaign",
            args: [campaignId, 1, 1, ...pointsReward],
        }),
    );

    await writeFacade(admin, adminWallet, "setMaxCampaignPointsPerCompletion", [40]);
    const { result } = await createCampaign();
    assert.equal(result.completerReward, 30n);
});

test("direct rewards have an independent admin-set maximum denominated in wei", async () => {
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "setMaxCampaignDirectRewardPerCompletion",
            args: [1],
        }),
    );

    // Prove a low points cap cannot accidentally limit a direct-payment campaign.
    await writeFacade(admin, adminWallet, "setMaxCampaignPointsPerCompletion", [0]);
    await writeFacade(admin, adminWallet, "setMaxCampaignDirectRewardPerCompletion", [39]);
    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "createCampaign",
            args: [campaignId, 1, 1, 1, 30, 10],
            value: 40n,
        }),
    );

    await writeFacade(admin, adminWallet, "setMaxCampaignDirectRewardPerCompletion", [40]);
    const { result } = await writeFacade(
        owner,
        ownerWallet,
        "createCampaign",
        [campaignId, 1, 1, 1, 30, 10],
        40n,
    );
    assert.equal(result.rewardType, 1);
    assert.equal(result.status, 1);
    assert.equal(result.balance, 40n);
});

// ---------- Rejecting a submission ----------

test("the owner can reject a submission, which pays nothing and is final", async () => {
    await joinProgram(parent, parentWallet);
    await acceptInvite(participant, participantWallet, parent, "parent-to-participant");
    await createCampaign();
    await submitFulfillment();

    await assert.rejects(
        publicClient.simulateContract({
            account: other,
            address: referralAddress,
            abi: referralAbi,
            functionName: "rejectCampaignFulfillment",
            args: [fulfillmentId],
        }),
    );

    const { result, receipt } = await writeFacade(owner, ownerWallet, "rejectCampaignFulfillment", [fulfillmentId]);
    assert.equal(result.status, 3); // Rejected

    const rejected = eventFrom(receipt, "CampaignFulfillmentRejected");
    assert.equal(rejected.args.campaignId, campaignId);
    assert.equal(rejected.args.fulfillmentId, fulfillmentId);
    assert.ok(same(rejected.args.verifier, owner.address));
    assert.ok(same(rejected.args.participant, participant.address));
    assert.equal(eventsFrom(receipt, "CampaignRewardPaid").length, 0);
    assert.equal(await pointsOf(participant), 0n);
    assert.equal(await pointsOf(parent), 0n);

    await assert.rejects(
        publicClient.simulateContract({
            account: owner,
            address: referralAddress,
            abi: referralAbi,
            functionName: "verifyCampaignFulfillment",
            args: [fulfillmentId],
        }),
    );
});
