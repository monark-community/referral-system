// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./ReferralRelationships.sol";
import "./ReferralPoints.sol";
import "./ReferralMilestone.sol";

contract ReferralProgram is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    ReferralRelationships private relationships;
    ReferralPoints private points;
    ReferralMilestone private milestones;

    EnumerableSet.AddressSet users;

    constructor() {
        relationships = new ReferralRelationships(msg.sender, address(this));
        points = new ReferralPoints(msg.sender, address(this));
        milestones = new ReferralMilestone(msg.sender, address(this));

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    //adds someone to the program without a referral
    function joinProgram() public {
        users.add(msg.sender);
    }

    //adds someone to the program using a referral
    function acceptInvite(address referrer) public {
        require(users.contains(referrer), "Referrer not in system");
        require(!users.contains(msg.sender), "Referree already in system");
        users.add(msg.sender);
        relationships.createRelationship(msg.sender, referrer);
        points.completeAction(ReferralPoints.Action.ReferredNewUser, referrer);
        points.completeAction(ReferralPoints.Action.AcceptedInvite, msg.sender);
        milestones.updateUserMilestone(
            msg.sender,
            points.getUserPoints(msg.sender)
        );
        milestones.updateUserMilestone(
            referrer,
            points.getUserPoints(referrer)
        );
    }

    function viewReferrals(address user) public view returns (address[] memory) {
        return relationships.viewReferrals(user);
    }

    function viewReferrer(address user) public view returns (address) {
        return relationships.viewReferrer(user);
    }

    function setPointsForAction(
        ReferralPoints.Action action,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        points.setPointsForAction(action, amount);
    }

    function viewPoints(address user) public view returns (uint256) {
        return points.getUserPoints(user);
    }

    function getCurrentUserMilestone(address user) public view returns (uint256) {
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
}
