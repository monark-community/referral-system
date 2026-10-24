// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Core Contract acts as a entry point into the referral contracts - handles invite status, points, user relationships, and milestones
// Notes:
// - Join program creates a user with no referral, accept invite creates a user with a referral
// - The points for actions and milestones are dynamic meaning to have any you must set values for them after creating the contract
// - OpenZeppelin acces control limits admin controls to only admin users

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./ReferralRelationships.sol";
import "./ReferralPoints.sol";
import "./ReferralMilestone.sol";
import "./ReferralInvites.sol";
import "./ReferralAllocation.sol";
import {CampaignTypes} from "./CampaignTypes.sol";
import {CampaignSignals} from "./CampaignSignals.sol";
import {Campaigns} from "./Campaigns.sol";

contract ReferralProgram is AccessControl, CampaignSignals {
    using EnumerableSet for EnumerableSet.AddressSet;

    ReferralRelationships private relationships;
    ReferralPoints private points;
    ReferralMilestone private milestones;
    ReferralInvites private invites;
    Campaigns private campaigns;

    uint16 public directReferralBps = 8_000;
    uint16 public grandparentReferralBps = 2_000;
    // Most points one campaign completion may pay: the completer's reward plus the referral pool
    uint256 public maxCampaignPointsPerCompletion;
    // Most wei one direct-payment campaign completion may pay: the completer's reward plus the referral pool
    uint256 public maxCampaignDirectRewardPerCompletion;

    // Direct rewards accrue here so one recipient cannot block campaign verification by rejecting ETH.
    mapping(address => uint256) public directRewardBalances;

    struct PendingPointAllocation {
        address directRecipient;
        address grandparentRecipient;
        uint256 directAmount;
        uint256 grandparentAmount;
    }

    mapping(bytes32 => PendingPointAllocation) private pendingPointAllocations;

    event ReferralPointsAllocated(
        address indexed participant,
        uint256 pool,
        address indexed directRecipient,
        uint256 directAmount,
        address indexed grandparentRecipient,
        uint256 grandparentAmount,
        uint256 unallocatedAmount
    );

    EnumerableSet.AddressSet users;

    constructor() {
        relationships = new ReferralRelationships(msg.sender, address(this));
        points = new ReferralPoints(msg.sender, address(this));
        milestones = new ReferralMilestone(msg.sender, address(this));
        invites = new ReferralInvites(msg.sender, address(this));
        campaigns = new Campaigns(msg.sender, address(this));

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    //adds someone to the program without a referral
    function joinProgram() public {
        users.add(msg.sender);
    }

    //adds someone to the program using a referral
    function acceptInvite(address referrer, bytes32 inviteId) public {
        require(users.contains(referrer), "Referrer not in system");
        require(!users.contains(msg.sender), "Referree already in system");
        users.add(msg.sender);
        relationships.createRelationship(msg.sender, referrer);

        uint256 referralPointPool = viewReferralPointPool();
        ReferralAllocation.Allocation memory allocation = _allocateReferralPool(
            msg.sender,
            referralPointPool
        );
        _awardReferralPoints(msg.sender, referralPointPool, allocation);

        // The new-user bonus is separate from the referral pool.
        points.completeAction(ReferralPoints.Action.AcceptedInvite, msg.sender);
        uint256 refereePoints = points.getUserPoints(msg.sender);
        emit ReferralPoints.PointsAdded(msg.sender, refereePoints, false);
        milestones.updateUserMilestone(msg.sender, refereePoints);
        completeInvite(inviteId, referrer);
    }

    function viewReferrals(
        address user
    ) public view returns (address[] memory) {
        return relationships.viewReferrals(user);
    }

    function viewAllReferrals(
        address user
    ) public view returns (ReferralRelationships.ReferralLevel[] memory) {
        return relationships.viewAllReferrals(user);
    }

    function viewReferrer(address user) public view returns (address) {
        return relationships.viewReferrer(user);
    }

    function viewAncestors(
        address user
    ) public view returns (address[2] memory) {
        return [
            relationships.viewReferrer(user),
            relationships.viewGrandparent(user)
        ];
    }

    function setPointsForAction(
        ReferralPoints.Action action,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        points.setPointsForAction(action, amount);
    }

    // Calculates the currently configured fixed points pool. Future reward
    // calculators can be added beside this function without changing allocation math.
    function viewReferralPointPool() public view returns (uint256) {
        return points.getPointsForAction(ReferralPoints.Action.ReferredNewUser);
    }

    function setReferralSplit(
        uint16 directBps,
        uint16 grandparentBps
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ReferralAllocation.validateSplit(directBps, grandparentBps);
        directReferralBps = directBps;
        grandparentReferralBps = grandparentBps;
    }

    function previewReferralPointAllocation(
        address participant,
        uint256 pointPool
    ) public view returns (ReferralAllocation.Allocation memory) {
        return _allocateReferralPool(participant, pointPool);
    }

    function viewPoints(address user) public view returns (uint256) {
        return points.getUserPoints(user);
    }

    function getCurrentUserMilestone(
        address user
    ) public view returns (uint256) {
        return milestones.getCurrentMilestone(user);
    }

    function addNewMilestone(
        uint256 value
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        milestones.insertMilestone(value);
    }

    function updateMilestone(
        uint256 value,
        uint256 milestoneToUpdate
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        milestones.updateMilestone(value, milestoneToUpdate);
    }

    // -- Functions for generalized campaigns and fulfillments

    // Any user can create a campaign, so an admin caps what one completion can pay out in total
    function setMaxCampaignPointsPerCompletion(
        uint256 maximum
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxCampaignPointsPerCompletion = maximum;
    }

    function setMaxCampaignDirectRewardPerCompletion(
        uint256 maximum
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxCampaignDirectRewardPerCompletion = maximum;
    }

    function createCampaign(
        bytes32 campaignId,
        CampaignTypes.TaskType taskType,
        CampaignTypes.VerificationType verificationType,
        CampaignTypes.RewardType rewardType,
        uint256 completerReward,
        uint256 referralPool
    ) public payable returns (CampaignTypes.Campaign memory campaign) {
        uint256 totalReward = completerReward + referralPool;
        if (
            rewardType == CampaignTypes.RewardType.Points && msg.value != 0
        ) {
            revert NonFundableCampaign();
        }
        uint256 maximumReward = rewardType == CampaignTypes.RewardType.Points
            ? maxCampaignPointsPerCompletion
            : maxCampaignDirectRewardPerCompletion;
        if (totalReward > maximumReward) {
            revert CampaignRewardAboveMaximum(totalReward, maximumReward);
        }
        campaign = campaigns.createCampaign(
            campaignId,
            msg.sender,
            taskType,
            verificationType,
            rewardType,
            completerReward,
            referralPool
        );
        emit CampaignCreated(
            campaign.id,
            campaign.owner,
            campaign.taskType,
            campaign.verificationType,
            campaign.rewardType,
            campaign.completerReward,
            campaign.referralPool
        );

        if (rewardType == CampaignTypes.RewardType.Direct && msg.value > 0) {
            campaigns.fundCampaign(campaignId, msg.sender, msg.value);
            campaign = campaigns.getCampaign(campaignId);
        }
    }

    function submitCampaignFulfillment(
        bytes32 campaignId,
        bytes32 fulfillmentId
    ) public returns (CampaignTypes.Fulfillment memory fulfillment) {
        CampaignTypes.Campaign memory campaign = campaigns.getCampaign(
            campaignId
        );
        fulfillment = campaigns.submitFulfillment(
            campaignId,
            fulfillmentId,
            msg.sender
        );
        emit CampaignFulfillmentSubmitted(
            fulfillment.campaignId,
            fulfillment.id,
            fulfillment.participant,
            campaign.taskType
        );
    }

    function verifyCampaignFulfillment(
        bytes32 fulfillmentId
    ) public returns (CampaignTypes.Fulfillment memory fulfillment) {
        fulfillment = campaigns.verifyFulfillment(fulfillmentId, msg.sender);
        CampaignTypes.Campaign memory campaign = campaigns.getCampaign(
            fulfillment.campaignId
        );
        emit CampaignFulfillmentVerified(
            fulfillment.campaignId,
            fulfillment.id,
            msg.sender,
            fulfillment.participant,
            campaign.verificationType
        );
        // Verifying is final, so this runs once per completion
        _payCampaignReward(campaign, fulfillment);
    }

    function rejectCampaignFulfillment(
        bytes32 fulfillmentId
    ) public returns (CampaignTypes.Fulfillment memory fulfillment) {
        fulfillment = campaigns.rejectFulfillment(fulfillmentId, msg.sender);
        emit CampaignFulfillmentRejected(
            fulfillment.campaignId,
            fulfillment.id,
            msg.sender,
            fulfillment.participant
        );
    }

    function fundCampaign(
        bytes32 campaignId
    ) public payable returns (uint256 numberOfRunsRemaining) {
        if (msg.value <= 0) {
            revert InsufficientFunds(msg.value);
        }
        return campaigns.fundCampaign(campaignId, msg.sender, msg.value);
    }

    function getCampaign(
        bytes32 campaignId
    ) public view returns (CampaignTypes.Campaign memory) {
        return campaigns.getCampaign(campaignId);
    }

    function getCampaignFulfillment(
        bytes32 fulfillmentId
    ) public view returns (CampaignTypes.Fulfillment memory) {
        return campaigns.getFulfillment(fulfillmentId);
    }

    function getParticipantCampaignFulfillment(
        bytes32 campaignId,
        address participant
    ) public view returns (CampaignTypes.Fulfillment memory) {
        bytes32 fulfillmentId = campaigns.getParticipantFulfillmentId(
            campaignId,
            participant
        );
        if (fulfillmentId == bytes32(0)) {
            revert FulfillmentNotFound(fulfillmentId);
        }
        return campaigns.getFulfillment(fulfillmentId);
    }

    // Withdraws every direct reward the caller has accumulated. A separate destination lets
    // contract accounts that cannot receive plain ETH route their funds to a payable address.
    function withdrawDirectRewards(
        address payable destination
    ) public returns (uint256 amount) {
        if (destination == address(0)) revert ZeroWithdrawalDestination();

        amount = directRewardBalances[msg.sender];
        if (amount == 0) revert NoDirectRewards(msg.sender);

        // Checks-effects-interactions: a reentrant withdrawal sees a zero balance.
        directRewardBalances[msg.sender] = 0;
        (bool success, ) = destination.call{value: amount}("");
        if (!success) revert DirectPaymentFailed(destination, amount);

        emit DirectRewardsWithdrawn(msg.sender, destination, amount);
    }

    // -- Functions for invites and statuses

    function createInvite(
        bytes32 inviteID,
        address referrer,
        ReferralInvites.InviteStatus status
    ) public {
        require(
            uint8(status) <= uint8(ReferralInvites.InviteStatus.Closed),
            "Invalid status"
        );
        invites.createInvite(inviteID, referrer, status);
        if (status == ReferralInvites.InviteStatus.Pending) {
            ReferralAllocation.Allocation memory allocation = ReferralAllocation
                .allocate(
                    viewReferralPointPool(),
                    referrer,
                    relationships.viewReferrer(referrer),
                    directReferralBps,
                    grandparentReferralBps
                );
            pendingPointAllocations[inviteID] = PendingPointAllocation({
                directRecipient: allocation.directRecipient,
                grandparentRecipient: allocation.grandparentRecipient,
                directAmount: allocation.directAmount,
                grandparentAmount: allocation.grandparentAmount
            });
            _addPendingPoints(allocation);
        }
        emit ReferralInvites.InviteChanged(inviteID, referrer, status);
    }

    function completeInvite(bytes32 inviteID, address referrer) public {
        bool removePending = invites.completeInvite(inviteID, referrer);
        if (removePending) {
            _removePendingPoints(inviteID);
        }
        emit ReferralInvites.InviteChanged(
            inviteID,
            referrer,
            ReferralInvites.InviteStatus.Accepted
        );
    }

    function updateInviteStatus(
        bytes32 inviteID,
        ReferralInvites.InviteStatus newStatus
    ) public {
        address referrer = invites.updateInviteStatus(inviteID, newStatus);
        emit ReferralInvites.InviteChanged(inviteID, referrer, newStatus);
    }

    function getInviteStatus(
        bytes32 inviteID
    ) public view returns (ReferralInvites.InviteStatus) {
        return invites.getInviteStatus(inviteID);
    }

    function getInviteReferrer(bytes32 inviteID) public view returns (address) {
        return invites.getInviteReferrer(inviteID);
    }

    struct ReferrerInviteSummary {
        bytes32 inviteId;
        ReferralInvites.InviteStatus status;
        uint256 points;
        address referrer;
    }

    function getReferrerInvites(
        address user
    ) public view returns (ReferrerInviteSummary[] memory) {
        ReferralInvites.InviteSummary[] memory inviteSummaries = invites
            .getReferrerInvites(user);
        ReferrerInviteSummary[] memory summaries = new ReferrerInviteSummary[](
            inviteSummaries.length
        );
        for (uint256 i = 0; i < inviteSummaries.length; i++) {
            summaries[i] = ReferrerInviteSummary({
                inviteId: inviteSummaries[i].inviteId,
                status: inviteSummaries[i].status,
                points: points.getPointsForAction(
                    ReferralPoints.Action.ReferredNewUser
                ),
                referrer: inviteSummaries[i].referrer
            });
        }

        return summaries;
    }

    function _allocateReferralPool(
        address participant,
        uint256 pointPool
    ) private view returns (ReferralAllocation.Allocation memory) {
        return
            ReferralAllocation.allocate(
                pointPool,
                relationships.viewReferrer(participant),
                relationships.viewGrandparent(participant),
                directReferralBps,
                grandparentReferralBps
            );
    }

    function _awardReferralPoints(
        address participant,
        uint256 pointPool,
        ReferralAllocation.Allocation memory allocation
    ) private {
        _payReferralAllocation(allocation);

        emit ReferralPointsAllocated(
            participant,
            pointPool,
            allocation.directRecipient,
            allocation.directAmount,
            allocation.grandparentRecipient,
            allocation.grandparentAmount,
            allocation.unallocatedAmount
        );
    }

    function _payReferralAllocation(
        ReferralAllocation.Allocation memory allocation
    ) private {
        if (allocation.directAmount > 0) {
            _awardAndUpdateMilestone(
                allocation.directRecipient,
                allocation.directAmount,
                allocation.rewardType,
                allocation.campaignId
            );
        }
        if (allocation.grandparentAmount > 0) {
            _awardAndUpdateMilestone(
                allocation.grandparentRecipient,
                allocation.grandparentAmount,
                allocation.rewardType,
                allocation.campaignId
            );
        }
    }

    // Pays a verified completion: the completer's reward, then the referral pool split between the
    // completer's referrer and grandparent the same way as a sign-up. A creator never earns referral
    // points from their own campaign, so a share that would go to them stays unallocated
    function _payCampaignReward(
        CampaignTypes.Campaign memory campaign,
        CampaignTypes.Fulfillment memory fulfillment
    ) private {
        if (campaign.completerReward > 0) {
            _awardAndUpdateMilestone(
                fulfillment.participant,
                campaign.completerReward,
                campaign.rewardType,
                campaign.id
            );
        }

        ReferralAllocation.Allocation memory allocation = _allocateReferralPool(
            fulfillment.participant,
            campaign.referralPool
        );
        allocation.rewardType = campaign.rewardType;
        allocation.campaignId = campaign.id;
        if (allocation.directRecipient == campaign.owner) {
            allocation.unallocatedAmount += allocation.directAmount;
            allocation.directAmount = 0;
        }
        if (allocation.grandparentRecipient == campaign.owner) {
            allocation.unallocatedAmount += allocation.grandparentAmount;
            allocation.grandparentAmount = 0;
        }
        _payReferralAllocation(allocation);

        emit CampaignRewardPaid(
            campaign.id,
            fulfillment.id,
            fulfillment.participant,
            campaign.rewardType,
            campaign.completerReward,
            campaign.referralPool,
            allocation
        );
    }

    function _awardAndUpdateMilestone(
        address recipient,
        uint256 amount,
        CampaignTypes.RewardType rewardType,
        bytes32 campaignId
    ) private {
        if (rewardType == CampaignTypes.RewardType.Points) {
            points.awardPoints(recipient, amount);
            uint256 balance = points.getUserPoints(recipient);
            emit ReferralPoints.PointsAdded(recipient, balance, false);
            milestones.updateUserMilestone(recipient, balance);
        }
        if (rewardType == CampaignTypes.RewardType.Direct) {
            campaigns.updateCampaignBalance(campaignId, amount);
            uint256 balance = directRewardBalances[recipient] + amount;
            directRewardBalances[recipient] = balance;
            emit DirectRewardAccrued(recipient, amount, balance);
        }
    }

    function _addPendingPoints(
        ReferralAllocation.Allocation memory allocation
    ) private {
        if (allocation.directAmount > 0) {
            points.addPendingPoints(
                allocation.directRecipient,
                allocation.directAmount
            );
            _emitPendingBalance(allocation.directRecipient);
        }
        if (allocation.grandparentAmount > 0) {
            points.addPendingPoints(
                allocation.grandparentRecipient,
                allocation.grandparentAmount
            );
            _emitPendingBalance(allocation.grandparentRecipient);
        }
    }

    function _removePendingPoints(bytes32 inviteID) private {
        PendingPointAllocation memory allocation = pendingPointAllocations[
            inviteID
        ];
        delete pendingPointAllocations[inviteID];

        if (allocation.directAmount > 0) {
            points.removePendingPoints(
                allocation.directRecipient,
                allocation.directAmount
            );
            _emitPendingBalance(allocation.directRecipient);
        }
        if (allocation.grandparentAmount > 0) {
            points.removePendingPoints(
                allocation.grandparentRecipient,
                allocation.grandparentAmount
            );
            _emitPendingBalance(allocation.grandparentRecipient);
        }
    }

    function _emitPendingBalance(address recipient) private {
        emit ReferralPoints.PointsAdded(
            recipient,
            points.getPendingUserPoints(recipient),
            true
        );
    }
}
