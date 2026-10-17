// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Keeps generalized campaign errors and events identical across the
// internal Campaigns module and the public ReferralProgram facade ABI.

import {CampaignTypes} from "./CampaignTypes.sol";

abstract contract CampaignSignals {
    error ZeroCampaignId();
    error ZeroFulfillmentId();
    error ZeroOwner();
    error ZeroParticipant();
    error CampaignAlreadyExists(bytes32 campaignId);
    error CampaignNotFound(bytes32 campaignId);
    error CampaignNotActive(bytes32 campaignId);
    error UnsupportedCampaignCombination(
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType
    );
    error UnsupportedTaskType(CampaignTypes.TaskType taskType);
    error UnsupportedVerificationType(
        CampaignTypes.VerificationType verificationType
    );
    error FulfillmentAlreadyExists(bytes32 fulfillmentId);
    error FulfillmentNotFound(bytes32 fulfillmentId);
    error ParticipantAlreadySubmitted(
        bytes32 campaignId,
        address participant,
        bytes32 fulfillmentId
    );
    error InvalidFulfillmentStatus(
        bytes32 fulfillmentId,
        CampaignTypes.FulfillmentStatus currentStatus
    );
    error UnauthorizedManualVerifier(
        bytes32 campaignId,
        address verifier
    );

    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed owner,
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType
    );

    event CampaignFulfillmentSubmitted(
        bytes32 indexed campaignId,
        bytes32 indexed fulfillmentId,
        address indexed participant,
        CampaignTypes.TaskType taskType
    );

    event CampaignFulfillmentVerified(
        bytes32 indexed campaignId,
        bytes32 indexed fulfillmentId,
        address indexed verifier,
        address participant,
        CampaignTypes.VerificationType verificationType
    );
}
