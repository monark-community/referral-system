// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Stores generalized campaigns and their fulfillment lifecycle.
// Notes:
// - Task and verification types remain independent and are composed per campaign.
// - Only complete vertical slices are accepted; the first is Bounty + Manual.
// - Off-chain evidence is deliberately excluded from contract storage.
// - ReferralProgram is intended to be the public facade and passes the acting wallet explicitly.

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CampaignTypes} from "./CampaignTypes.sol";
import {CampaignSignals} from "./CampaignSignals.sol";

contract Campaigns is AccessControl, CampaignSignals {
    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    mapping(bytes32 => CampaignTypes.Campaign) private campaigns;
    mapping(bytes32 => CampaignTypes.Fulfillment) private fulfillments;
    mapping(bytes32 => mapping(address => bytes32))
        private participantFulfillmentIds;

    constructor(address adminRole, address accessRole) {
        _grantRole(DEFAULT_ADMIN_ROLE, adminRole);
        _grantRole(ACCESS_ROLE, adminRole);
        _grantRole(ACCESS_ROLE, accessRole);
    }

    function createCampaign(
        bytes32 campaignId,
        address owner,
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType,
        CampaignTypes.RewardType rewardType,
        uint256 completerReward,
        uint256 referralPool
    ) external onlyRole(ACCESS_ROLE) returns (CampaignTypes.Campaign memory) {
        if (campaignId == bytes32(0)) revert ZeroCampaignId();
        if (owner == address(0)) revert ZeroOwner();
        if (
            campaigns[campaignId].status !=
            CampaignTypes.CampaignStatus.None
        ) revert CampaignAlreadyExists(campaignId);
        if (!isSupportedCombination(taskType, verificationType)) {
            revert UnsupportedCampaignCombination(taskType, verificationType);
        }

        campaigns[campaignId] = CampaignTypes.Campaign({
            id: campaignId,
            owner: owner,
            taskType: taskType,
            verificationType: verificationType,
            status: CampaignTypes.CampaignStatus.Active,
            rewardType: rewardType,
            completerReward: completerReward,
            referralPool: referralPool
        });
        return campaigns[campaignId];
    }

    function submitFulfillment(
        bytes32 campaignId,
        bytes32 fulfillmentId,
        address participant
    ) external onlyRole(ACCESS_ROLE) returns (CampaignTypes.Fulfillment memory) {
        if (fulfillmentId == bytes32(0)) revert ZeroFulfillmentId();
        if (participant == address(0)) revert ZeroParticipant();
        if (
            fulfillments[fulfillmentId].status !=
            CampaignTypes.FulfillmentStatus.None
        ) revert FulfillmentAlreadyExists(fulfillmentId);

        CampaignTypes.Campaign storage campaign = _requireCampaign(campaignId);
        if (campaign.status != CampaignTypes.CampaignStatus.Active) {
            revert CampaignNotActive(campaignId);
        }
        if (participant == campaign.owner) {
            revert CampaignOwnerCannotParticipate(campaignId, participant);
        }

        _validateTaskSubmission(campaign.taskType);

        bytes32 existingFulfillmentId = participantFulfillmentIds[campaignId][
            participant
        ];
        if (existingFulfillmentId != bytes32(0)) {
            revert ParticipantAlreadySubmitted(
                campaignId,
                participant,
                existingFulfillmentId
            );
        }

        fulfillments[fulfillmentId] = CampaignTypes.Fulfillment({
            id: fulfillmentId,
            campaignId: campaignId,
            participant: participant,
            status: CampaignTypes.FulfillmentStatus.Submitted
        });
        participantFulfillmentIds[campaignId][participant] = fulfillmentId;
        return fulfillments[fulfillmentId];
    }

    function verifyFulfillment(
        bytes32 fulfillmentId,
        address verifier
    ) external onlyRole(ACCESS_ROLE) returns (CampaignTypes.Fulfillment memory) {
        return
            _decideFulfillment(
                fulfillmentId,
                verifier,
                CampaignTypes.FulfillmentStatus.Verified
            );
    }

    // A rejected participant keeps their one submission, so they cannot submit again
    function rejectFulfillment(
        bytes32 fulfillmentId,
        address verifier
    ) external onlyRole(ACCESS_ROLE) returns (CampaignTypes.Fulfillment memory) {
        return
            _decideFulfillment(
                fulfillmentId,
                verifier,
                CampaignTypes.FulfillmentStatus.Rejected
            );
    }

    function getCampaign(
        bytes32 campaignId
    ) external view returns (CampaignTypes.Campaign memory) {
        return _requireCampaign(campaignId);
    }

    function getFulfillment(
        bytes32 fulfillmentId
    ) external view returns (CampaignTypes.Fulfillment memory) {
        return _requireFulfillment(fulfillmentId);
    }

    function getParticipantFulfillmentId(
        bytes32 campaignId,
        address participant
    ) external view returns (bytes32) {
        _requireCampaign(campaignId);
        return participantFulfillmentIds[campaignId][participant];
    }

    function isSupportedCombination(
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType
    ) public pure returns (bool) {
        return
            taskType == CampaignTypes.TaskType.Bounty &&
            verificationType == CampaignTypes.VerificationType.Manual;
    }

    // Verifying and rejecting are the creator's two decisions on a submission; each can be made once
    function _decideFulfillment(
        bytes32 fulfillmentId,
        address verifier,
        CampaignTypes.FulfillmentStatus decision
    ) private returns (CampaignTypes.Fulfillment memory) {
        CampaignTypes.Fulfillment storage fulfillment = _requireFulfillment(
            fulfillmentId
        );
        if (
            fulfillment.status !=
            CampaignTypes.FulfillmentStatus.Submitted
        ) {
            revert InvalidFulfillmentStatus(
                fulfillmentId,
                fulfillment.status
            );
        }

        CampaignTypes.Campaign storage campaign = _requireCampaign(
            fulfillment.campaignId
        );
        if (campaign.status != CampaignTypes.CampaignStatus.Active) {
            revert CampaignNotActive(campaign.id);
        }

        _authorizeVerifier(campaign, verifier);
        fulfillment.status = decision;
        return fulfillment;
    }

    function _validateTaskSubmission(
        CampaignTypes.TaskType taskType
    ) private pure {
        if (taskType != CampaignTypes.TaskType.Bounty) {
            revert UnsupportedTaskType(taskType);
        }
    }

    function _authorizeVerifier(
        CampaignTypes.Campaign storage campaign,
        address verifier
    ) private view {
        if (
            campaign.verificationType !=
            CampaignTypes.VerificationType.Manual
        ) {
            revert UnsupportedVerificationType(campaign.verificationType);
        }
        if (verifier != campaign.owner) {
            revert UnauthorizedManualVerifier(campaign.id, verifier);
        }
    }

    function _requireCampaign(
        bytes32 campaignId
    ) private view returns (CampaignTypes.Campaign storage campaign) {
        campaign = campaigns[campaignId];
        if (campaign.status == CampaignTypes.CampaignStatus.None) {
            revert CampaignNotFound(campaignId);
        }
    }

    function _requireFulfillment(
        bytes32 fulfillmentId
    ) private view returns (CampaignTypes.Fulfillment storage fulfillment) {
        fulfillment = fulfillments[fulfillmentId];
        if (
            fulfillment.status == CampaignTypes.FulfillmentStatus.None
        ) {
            revert FulfillmentNotFound(fulfillmentId);
        }
    }
}
