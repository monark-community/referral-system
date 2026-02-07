// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

//TODO - add the actual reward logic once we have more info

contract MilestoneRewards is AccessControl {
    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);
    }

    function awardReward(uint256) public onlyRole(ACCESS_ROLE) {
        //TODO add reward functionality
    }
}
