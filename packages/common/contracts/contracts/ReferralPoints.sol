// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract ReferralPoints is AccessControl {
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    // Actions that warrent a reward - Add to this list to modify
    enum Action {
        ReferredNewUser,
        AcceptedInvite
    }

    event PointsAdded(address indexed user, uint256 points);

    mapping(Action => uint256) pointsForAction;
    mapping(address => mapping(Action => uint256)) public userActionCounts;

    //Gives the role of access to the contract provided, and admin to the user provided
    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);
    }

    function setPointsForAction(Action action, uint256 amount) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "setPointsForAction: caller lacks ACCESS_ROLE"
        );
        require(amount >= 0, "Points cannot be negative");
        pointsForAction[action] = amount;
    }

    function completeAction(Action action, address user) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "completeAction: caller lacks ACCESS_ROLE"
        );
        userActionCounts[user][action] += 1;
    }

    function getUserPoints(
        address user
    ) public view onlyRole(ACCESS_ROLE) returns (uint256) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "getUserPoints: caller lacks ACCESS_ROLE"
        );
        uint256 usersPointAmount = 0;
        

        for (uint256 i = 0; i <= uint256(type(Action).max); i++) {
        Action action = Action(i);
        uint256 completedAmount = userActionCounts[user][action];
        usersPointAmount += completedAmount * pointsForAction[action];
    }

        return usersPointAmount;
    }
}
