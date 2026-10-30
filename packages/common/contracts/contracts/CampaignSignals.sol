// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Keeps generalized campaign errors and events identical across the
// internal Campaigns module and the public ReferralProgram facade ABI.

import {CampaignTypes} from "./CampaignTypes.sol";
import {ReferralAllocation} from "./ReferralAllocation.sol";

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
    error UnauthorizedManualVerifier(bytes32 campaignId, address verifier);
    error UnauthorizedPreVerifiedParticipant(
        bytes32 fulfillmentId,
        address caller,
        address participant
    );
    error PreVerifiedCampaignMustBePrivate(bytes32 campaignId);
    error UnauthorizedUser(address user);
    error CampaignOwnerCannotParticipate(bytes32 campaignId, address owner);
    error CampaignRewardAboveMaximum(uint256 reward, uint256 maximum);
    error ZeroCampaignReward();
    error InsufficientFunds(uint256 amount);
    error NonFundableCampaign();
    error NoDirectRewards(address account);
    error ZeroWithdrawalDestination();
    error DirectPaymentFailed(address recipient, uint256 amount);

    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed owner,
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType,
        CampaignTypes.RewardType rewardType,
        uint256 completerReward,
        uint256 referralPool
    );

    event CampaignVisibilitySet(
        bytes32 indexed campaignId,
        CampaignTypes.CampaignVisibility visibility
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

    event CampaignFulfillmentRejected(
        bytes32 indexed campaignId,
        bytes32 indexed fulfillmentId,
        address indexed verifier,
        address participant
    );

    // Sent with every verified completion. Kept apart from ReferralPointsAllocated, which always means a sign-up
    event CampaignRewardPaid(
        bytes32 indexed campaignId,
        bytes32 indexed fulfillmentId,
        address indexed participant,
        CampaignTypes.RewardType rewardType,
        uint256 completerReward,
        uint256 referralPool,
        ReferralAllocation.Allocation referralPayout
    );

    event DirectRewardAccrued(
        address indexed account,
        uint256 amount,
        uint256 balance
    );

    event DirectRewardsWithdrawn(
        address indexed account,
        address indexed destination,
        uint256 amount
    );
}
