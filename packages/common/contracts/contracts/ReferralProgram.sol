// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./ReferralRelationships.sol";

contract ReferralProgram is AccessControl {
    ReferralRelationships public relationships;

    constructor() {
        relationships = new ReferralRelationships(msg.sender, address(this));
    }

    function acceptInvite(address referrer) public {
        relationships.createRelationship(msg.sender, referrer);
    }

    function viewReferrals() public view returns (address[] memory) {
        return relationships.viewReferrals(msg.sender);
    }

    function viewReferrer() public view returns (address) {
        return relationships.viewReferrer(msg.sender);
    }
}
