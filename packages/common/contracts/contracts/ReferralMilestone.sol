// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./MilestoneRewards.sol";

contract ReferralMilestone is AccessControl {
    using EnumerableMap for EnumerableMap.AddressToUintMap;

    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");
    MilestoneRewards private rewards;

    uint256[] milestoneAmounts;
    EnumerableMap.AddressToUintMap usersCurrentMilestone;

    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);

        rewards = new MilestoneRewards(admin_role, address(this));
    }

    //check current milestone
    function checkMilestone(address user, uint256 currentPoints) public onlyRole("ACCESS_ROLE"){
        uint256 previousMilestone = usersCurrentMilestone.get(user);
        uint256 currentMilestone = previousMilestone;
        for(uint256 i = previousMilestone; i<milestoneAmounts.length-1; i++){
            if(currentPoints>milestoneAmounts[i]){
                currentMilestone = i;
            } else {
                break;
            }
        }

        if(previousMilestone != currentMilestone){
            usersCurrentMilestone.set(user, currentMilestone);
            for (uint256 j = previousMilestone + 1; j <= currentMilestone; j++) {
                rewards.awardReward(j);
            }
        }
    }

    //functions for adding milestone values
    function insertMilestone(uint256 value) public onlyRole("ACCESS_ROLE") {
        require(
            validMilestone(value, milestoneAmounts.length),
            "Invalid Milestone Value"
        );

        milestoneAmounts.push(value);
    }

    function updateMilestone(uint256 value, uint256 position) public onlyRole("ACCESS_ROLE"){
        require(validMilestone(value, position), "Invalid Milestone Value");

        milestoneAmounts[position] = value;
    }

    //verifies the new milestone followes an increasing order
    function validMilestone(
        uint256 insertedMilestone,
        uint256 position
    ) private view returns (bool) {
        // verify parmaeters - cannot insert past length (here changing at position == length means an insert)
        if (position > milestoneAmounts.length) {
            return false;
        }

        /*Start of cases*/
        if (milestoneAmounts.length == 0) {
            // if empty you can always insert - need to include if you want to do Check 2
            return true;
        }
        //Check 1 - the previous element is smaller than the new element
        if (position > 0) {
            // if the position is 0 no need to check the previous element
            if (milestoneAmounts[position - 1] >= insertedMilestone) {
                return false;
            }
        }
        //Check 2 - the element after is larger
        if (position < milestoneAmounts.length - 1) {
            // if inserting or changing last element no need to check
            if (milestoneAmounts[position + 1] <= insertedMilestone) {
                return false;
            }
        }
        return true; // The number is in the correct order
    }
}
