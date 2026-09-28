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

contract ReferralProgram is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    ReferralRelationships private relationships;
    ReferralPoints private points;
    ReferralMilestone private milestones;
    ReferralInvites private invites;

    uint16 public directReferralBps = 8_000;
    uint16 public grandparentReferralBps = 2_000;

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
        return
            points.getPointsForAction(
                ReferralPoints.Action.ReferredNewUser
            );
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
        if (allocation.directAmount > 0) {
            _awardAndUpdateMilestone(
                allocation.directRecipient,
                allocation.directAmount
            );
        }
        if (allocation.grandparentAmount > 0) {
            _awardAndUpdateMilestone(
                allocation.grandparentRecipient,
                allocation.grandparentAmount
            );
        }

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

    function _awardAndUpdateMilestone(
        address recipient,
        uint256 amount
    ) private {
        points.awardPoints(recipient, amount);
        uint256 balance = points.getUserPoints(recipient);
        emit ReferralPoints.PointsAdded(recipient, balance, false);
        milestones.updateUserMilestone(recipient, balance);
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
