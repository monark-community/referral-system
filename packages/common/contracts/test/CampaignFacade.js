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
let ownerWallet;
let participantWallet;
let referralAddress;
let referralAbi;

const campaignId = stringToHex("campaign-facade", { size: 32 });
const fulfillmentId = stringToHex("fulfillment-facade", { size: 32 });

before(async () => {
    [admin, owner, participant, other] = [0, 1, 2, 3].map((addressIndex) =>
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
});

async function writeFacade(account, wallet, functionName, args) {
    const { request, result } = await publicClient.simulateContract({
        account,
        address: referralAddress,
        abi: referralAbi,
        functionName,
        args,
    });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { result, receipt };
}

function eventFrom(receipt, eventName) {
    for (const log of receipt.logs) {
        try {
            return decodeEventLog({
                abi: referralAbi,
                eventName,
                data: log.data,
                topics: log.topics,
            });
        } catch {
            // Ignore logs for other events in the same transaction.
        }
    }
    assert.fail(`${eventName} was not emitted`);
}

async function createCampaign() {
    return writeFacade(owner, ownerWallet, "createCampaign", [campaignId, 1, 1]);
}

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

    for (const name of [
        "createCampaign",
        "submitCampaignFulfillment",
        "verifyCampaignFulfillment",
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

    const created = eventFrom(receipt, "CampaignCreated");
    assert.equal(created.args.campaignId, campaignId);
    assert.equal(created.args.owner.toLowerCase(), owner.address.toLowerCase());
    assert.equal(created.args.taskType, 1);
    assert.equal(created.args.verificationType, 1);

    const stored = await publicClient.readContract({
        address: referralAddress,
        abi: referralAbi,
        functionName: "getCampaign",
        args: [campaignId],
    });
    assert.deepEqual(stored, result);
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
            args: [campaignId, 1, 1],
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
