// Purpose: Tests generalized campaign storage and fulfillment rules independently of the facade.

import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
    createPublicClient,
    createWalletClient,
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
let adminWallet;
let contractAddress;
let abi;

const campaignId = stringToHex("campaign-1", { size: 32 });
const secondCampaignId = stringToHex("campaign-2", { size: 32 });
const fulfillmentId = stringToHex("fulfillment-1", { size: 32 });
const secondFulfillmentId = stringToHex("fulfillment-2", { size: 32 });
// RewardType.Points, then 30 points for the completer and a 10-point referral pool
const pointsReward = [0, 30, 10];

before(async () => {
    // Test files run at the same time against one Hardhat node, so each file signs with its own accounts;
    // sharing one would make their transactions collide on the account's nonce
    [admin, owner, participant, other] = [10, 11, 12, 13].map((addressIndex) =>
        mnemonicToAccount(hardhatMnemonic, { addressIndex }),
    );
    publicClient = createPublicClient({
        transport: http("http://127.0.0.1:8545"),
    });
    adminWallet = createWalletClient({
        account: admin,
        transport: http("http://127.0.0.1:8545"),
    });
    abi = (await hre.artifacts.readArtifact("Campaigns")).abi;
});

beforeEach(async () => {
    const artifact = await hre.artifacts.readArtifact("Campaigns");
    const hash = await adminWallet.deployContract({
        abi,
        bytecode: artifact.bytecode,
        args: [admin.address, admin.address],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    contractAddress = receipt.contractAddress;
});

async function write(functionName, args) {
    const { request } = await publicClient.simulateContract({
        account: admin,
        address: contractAddress,
        abi,
        functionName,
        args,
    });
    const hash = await adminWallet.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
}

async function createCampaign(id = campaignId) {
    // TaskType.Bounty = 1 and VerificationType.Manual = 1.
    await write("createCampaign", [id, owner.address, 1, 1, ...pointsReward]);
}

async function getFulfillmentStatus(id = fulfillmentId) {
    const fulfillment = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getFulfillment",
        args: [id],
    });
    return fulfillment.status;
}

function simulate(functionName, args) {
    return publicClient.simulateContract({
        account: admin,
        address: contractAddress,
        abi,
        functionName,
        args,
    });
}

async function submitFulfillment(id = fulfillmentId) {
    await write("submitFulfillment", [campaignId, id, participant.address]);
}

test("stores Bounty and Manual as independent campaign types", async () => {
    await createCampaign();

    const campaign = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getCampaign",
        args: [campaignId],
    });

    assert.equal(campaign.id, campaignId);
    assert.equal(campaign.owner.toLowerCase(), owner.address.toLowerCase());
    assert.equal(campaign.taskType, 1);
    assert.equal(campaign.verificationType, 1);
    assert.equal(campaign.status, 1);
    assert.equal(campaign.rewardType, 0);
    assert.equal(campaign.completerReward, 30n);
    assert.equal(campaign.referralPool, 10n);
});

test("admits only the implemented Bounty and Manual combination", async () => {
    assert.equal(
        await publicClient.readContract({
            address: contractAddress,
            abi,
            functionName: "isSupportedCombination",
            args: [1, 1],
        }),
        true,
    );

    for (const [taskType, verificationType] of [
        [0, 0],
        [0, 1],
        [1, 0],
    ]) {
        assert.equal(
            await publicClient.readContract({
                address: contractAddress,
                abi,
                functionName: "isSupportedCombination",
                args: [taskType, verificationType],
            }),
            false,
        );
    }

    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "createCampaign",
            args: [campaignId, owner.address, 0, 1, ...pointsReward],
        }),
    );
});

test("rejects zero and duplicate campaign identities", async () => {
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "createCampaign",
            args: [stringToHex("", { size: 32 }), owner.address, 1, 1, ...pointsReward],
        }),
    );
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "createCampaign",
            args: [secondCampaignId, zeroAddress, 1, 1, ...pointsReward],
        }),
    );

    await createCampaign();
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "createCampaign",
            args: [campaignId, other.address, 1, 1, ...pointsReward],
        }),
    );
});

test("records one participant-submitted fulfillment per campaign", async () => {
    await createCampaign();
    await submitFulfillment();

    const fulfillment = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getFulfillment",
        args: [fulfillmentId],
    });
    assert.equal(fulfillment.id, fulfillmentId);
    assert.equal(fulfillment.campaignId, campaignId);
    assert.equal(
        fulfillment.participant.toLowerCase(),
        participant.address.toLowerCase(),
    );
    assert.equal(fulfillment.status, 1);
    assert.equal(
        await publicClient.readContract({
            address: contractAddress,
            abi,
            functionName: "getParticipantFulfillmentId",
            args: [campaignId, participant.address],
        }),
        fulfillmentId,
    );

    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "submitFulfillment",
            args: [campaignId, secondFulfillmentId, participant.address],
        }),
    );
});

test("rejects invalid fulfillment identities and missing campaigns", async () => {
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "submitFulfillment",
            args: [campaignId, fulfillmentId, participant.address],
        }),
    );

    await createCampaign();
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "submitFulfillment",
            args: [campaignId, stringToHex("", { size: 32 }), participant.address],
        }),
    );
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "submitFulfillment",
            args: [campaignId, fulfillmentId, zeroAddress],
        }),
    );

    await submitFulfillment();
    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "submitFulfillment",
            args: [campaignId, fulfillmentId, other.address],
        }),
    );
});

test("allows only the campaign owner to perform manual verification", async () => {
    await createCampaign();
    await submitFulfillment();

    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "verifyFulfillment",
            args: [fulfillmentId, other.address],
        }),
    );

    await write("verifyFulfillment", [fulfillmentId, owner.address]);
    const fulfillment = await publicClient.readContract({
        address: contractAddress,
        abi,
        functionName: "getFulfillment",
        args: [fulfillmentId],
    });
    assert.equal(fulfillment.status, 2);

    await assert.rejects(
        publicClient.simulateContract({
            account: admin,
            address: contractAddress,
            abi,
            functionName: "verifyFulfillment",
            args: [fulfillmentId, owner.address],
        }),
    );
});

// The local node reports every revert as "Internal error" without the error's data, so each refusal
// below is paired with the same call succeeding once only the condition under test changes

test("stops the campaign owner from completing their own campaign", async () => {
    await createCampaign();

    await assert.rejects(
        simulate("submitFulfillment", [campaignId, fulfillmentId, owner.address]),
    );
    // The same submission from anyone else goes through
    await submitFulfillment();
    assert.equal(await getFulfillmentStatus(), 1);
});

test("allows only the campaign owner to reject, and a rejection is final", async () => {
    await createCampaign();
    await submitFulfillment();

    await assert.rejects(
        simulate("rejectFulfillment", [fulfillmentId, other.address]),
    );

    await write("rejectFulfillment", [fulfillmentId, owner.address]);
    assert.equal(await getFulfillmentStatus(), 3); // Rejected

    // Neither decision can follow a rejection
    await assert.rejects(
        simulate("rejectFulfillment", [fulfillmentId, owner.address]),
    );
    await assert.rejects(
        simulate("verifyFulfillment", [fulfillmentId, owner.address]),
    );
    // The rejected participant keeps their one submission, so they cannot submit again
    await assert.rejects(
        simulate("submitFulfillment", [campaignId, secondFulfillmentId, participant.address]),
    );
    // while someone who has not submitted still can
    await write("submitFulfillment", [campaignId, secondFulfillmentId, other.address]);
    assert.equal(await getFulfillmentStatus(secondFulfillmentId), 1);
});

test("a verified submission cannot be rejected", async () => {
    await createCampaign();
    await submitFulfillment();
    await write("verifyFulfillment", [fulfillmentId, owner.address]);

    await assert.rejects(
        simulate("rejectFulfillment", [fulfillmentId, owner.address]),
    );
    assert.equal(await getFulfillmentStatus(), 2); // still Verified
});

test("keeps off-chain evidence out of the submission ABI", () => {
    const submit = abi.find(
        (item) => item.type === "function" && item.name === "submitFulfillment",
    );
    assert.deepEqual(
        submit.inputs.map(({ name, type }) => ({ name, type })),
        [
            { name: "campaignId", type: "bytes32" },
            { name: "fulfillmentId", type: "bytes32" },
            { name: "participant", type: "address" },
        ],
    );
});
