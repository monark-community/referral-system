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
        milestones.checkMilestone(msg.sender, points.getUserPoints(msg.sender));
        milestones.checkMilestone(referrer, points.getUserPoints(referrer));
    }

    function viewReferrals() public view returns (address[] memory) {
        return relationships.viewReferrals(msg.sender);
    }

    function viewReferrer() public view returns (address) {
        return relationships.viewReferrer(msg.sender);
    }

    function viewPoints() public view returns (uint256) {
        return points.getUserPoints(msg.sender);
    }
}
