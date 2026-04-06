// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

// Purpose: Holds the status of a milestone a user earns after a certain number of points
// Notes:
// - Rewards for milestones on chain can be added
// - OpenZeppelin access control limits all calls to an admin and the ReferralProgram.sol contract - cannot call directly as a user

contract MilestoneRewards is AccessControl {
    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);
    }

    event RewardAwarded(uint256 indexed milestoneLevel);

    //Hook for adding on chain rewards for a user - ie tranfer a token
    function awardReward(uint256 milestoneLevel) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "awardReward: caller lacks ACCESS_ROLE"
        );
        emit RewardAwarded(milestoneLevel);
        // Edit to add
    }
}
