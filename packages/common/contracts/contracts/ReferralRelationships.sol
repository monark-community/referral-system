// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Holds the relationships between users
// Notes:
// - Two maps are used to avoid resource heavy loops in other function calls
// - OpenZeppelin access control limits all calls to an admin and the ReferralProgram.sol contract - cannot call directly as a user

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract ReferralRelationships is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    //Role allowing access to the contract
    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    //Gives the role of access to the contract provided, and admin to the user provided
    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);
    }

    // Set to store the addresses of the referrees for each referrer address
    mapping(address => EnumerableSet.AddressSet) private _referrals;

    //Set to store the referrer of each account
    mapping(address => address) private _referrers;

    function createRelationship(
        address referree,
        address referrer
    ) external onlyRole(ACCESS_ROLE) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "createRelationship: caller lacks ACCESS_ROLE"
        );
        require(
            _referrers[referree] == address(0),
            "Cannot accept invite, already referred"
        );
        require(referree != referrer, "Cannot refer self");

        _referrers[referree] = referrer;

        _referrals[referrer].add(referree);
    }

    function viewReferrer(
        address referree
    ) external view onlyRole(ACCESS_ROLE) returns (address) {
        return _referrers[referree];
    }

    function viewReferrals(
        address referree
    ) external view onlyRole(ACCESS_ROLE) returns (address[] memory) {
        return _referrals[referree].values();
    }

    function viewGrandparent(
        address referree
    ) external view onlyRole(ACCESS_ROLE) returns (address) {
        return _referrers[_referrers[referree]];
    }

    struct ReferralLevel {
        uint8 level;
        address referral;
    }

    function viewAllReferrals(
        address user
    ) external view onlyRole(ACCESS_ROLE) returns (ReferralLevel[] memory) {
        uint256 referralCount = _ReferralCount(user);
        ReferralLevel[] memory referrals = new ReferralLevel[](referralCount);

        uint256 nextIndex = 0;

        address[] memory directReferrals = _referrals[user].values();
        for (uint256 i = 0; i < directReferrals.length; i++) {
            address directReferree = directReferrals[i];
            referrals[nextIndex++] = ReferralLevel({
                referral: directReferree,
                level: 1
            });

            address[] memory subReferees = _referrals[directReferree].values();

            for (uint256 j = 0; j < subReferees.length; j++) {
                referrals[nextIndex++] = ReferralLevel({
                    referral: subReferees[j],
                    level: 2
                });
            }
        }

        return referrals;
    }

    function _ReferralCount(address user) private view returns (uint256) {
        address[] memory directReferrals = _referrals[user].values();
        uint256 count = directReferrals.length;

        for (uint256 i = 0; i < directReferrals.length; i++) {
            count += _referrals[directReferrals[i]].length();
        }

        return count;
    }
}
