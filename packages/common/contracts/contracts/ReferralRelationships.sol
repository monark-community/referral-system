// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

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
}
