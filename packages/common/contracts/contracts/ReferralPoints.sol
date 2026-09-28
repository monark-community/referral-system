// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Holds earned and pending point balances and the actions users completed.
// Notes:
// - Action amounts calculate point pools for future awards.
// - Awarded balances are snapshotted so configuration changes do not reprice history.
// - OpenZeppelin access control limits all calls to an admin and the ReferralProgram.sol contract - cannot call directly as a user

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

    event PointsAdded(address indexed user, uint256 points, bool isPending);

    mapping(Action => uint256) pointsForAction;
    mapping(address => mapping(Action => uint256)) public userActionCounts;
    mapping(address => mapping(Action => uint256))
        public userPendingActionCounts;
    mapping(address => uint256) private earnedPointBalances;
    mapping(address => uint256) private pendingPointBalances;

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
        pointsForAction[action] = amount;
    }

    function completeAction(Action action, address user) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "completeAction: caller lacks ACCESS_ROLE"
        );
        userActionCounts[user][action] += 1;
        earnedPointBalances[user] += pointsForAction[action];
    }

    function awardPoints(address user, uint256 amount) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "awardPoints: caller lacks ACCESS_ROLE"
        );
        require(user != address(0), "Cannot award the zero address");
        earnedPointBalances[user] += amount;
    }

    function getPointsForAction(Action action) public view returns (uint256) {
        return pointsForAction[action];
    }

    function getUserPoints(
        address user
    ) public view onlyRole(ACCESS_ROLE) returns (uint256) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "getUserPoints: caller lacks ACCESS_ROLE"
        );
        return earnedPointBalances[user];
    }

    function addPendingAction(Action action, address user) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "completeAction: caller lacks ACCESS_ROLE"
        );
        userPendingActionCounts[user][action] += 1;
        pendingPointBalances[user] += pointsForAction[action];
    }

    function completePendingAction(Action action, address user) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "completeAction: caller lacks ACCESS_ROLE"
        );
        if (userPendingActionCounts[user][action] > 0) {
            userPendingActionCounts[user][action] -= 1;
            uint256 amount = pointsForAction[action];
            pendingPointBalances[user] -= amount > pendingPointBalances[user]
                ? pendingPointBalances[user]
                : amount;
        }
    }

    function addPendingPoints(address user, uint256 amount) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "addPendingPoints: caller lacks ACCESS_ROLE"
        );
        require(user != address(0), "Cannot award the zero address");
        pendingPointBalances[user] += amount;
    }

    function removePendingPoints(address user, uint256 amount) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "removePendingPoints: caller lacks ACCESS_ROLE"
        );
        require(
            pendingPointBalances[user] >= amount,
            "Pending point balance is too low"
        );
        pendingPointBalances[user] -= amount;
    }

    function getPendingUserPoints(
        address user
    ) public view onlyRole(ACCESS_ROLE) returns (uint256) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "getUserPoints: caller lacks ACCESS_ROLE"
        );
        return pendingPointBalances[user];
    }
}
