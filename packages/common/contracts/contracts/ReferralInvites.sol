// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Holds the status of a referrer's invite status
// Notes:
// - Currently status can be PENDING, ACCEPTED, or CLOSED
// - OpenZeppelin access control limits all calls to an admin and the ReferralProgram.sol contract - cannot call directly as a user
// - Completing a invite can mean creating a new one (usually for joinProgram) or updating a invite (usually for acceptInvite)

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ReferralInvites is AccessControl {
    //Role allowing access to the contract
    bytes32 public constant ACCESS_ROLE = keccak256("ACCESS_ROLE");

    enum InviteStatus {
        Pending,
        Accepted,
        Closed
    }

    struct Invite {
        address referrer;
        InviteStatus status;
    }

    event InviteChanged(
        bytes32 indexed inviteId,
        address indexed referrer,
        InviteStatus status
    );

    //Holds the invites based on a unique id code
    mapping(bytes32 => Invite) public invites;

    //Holds the invite codes associated with a user, if any
    mapping(address => bytes32[]) public userInvites;

    //Gives the role of access to the contract provided, and admin to the user provided
    constructor(address admin_role, address access_role) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, admin_role);
        _grantRole(ACCESS_ROLE, access_role);
    }

    function createInvite(
        bytes32 inviteID,
        address user,
        InviteStatus status
    ) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "createInvite: caller lacks ACCESS_ROLE"
        );
        require(
            invites[inviteID].referrer == address(0),
            "Invite ID already exists"
        );
        invites[inviteID] = Invite({referrer: user, status: status});
        userInvites[user].push(inviteID);
    }

    //depending on whether this is an existing invite, create a new one or update it to accepted - return whether it was an existing
    function completeInvite(
        bytes32 inviteID,
        address user
    ) public returns (bool existingInvite) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "createInvite: caller lacks ACCESS_ROLE"
        );
        if (invites[inviteID].referrer == address(0)) {
            createInvite(inviteID, user, InviteStatus.Accepted);
            return false;
        } else {
            invites[inviteID].status = InviteStatus.Accepted;
            return true;
        }
    }

    function updateInviteStatus(
        bytes32 inviteID,
        InviteStatus newStatus
    ) public returns (address) {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "updateInviteStatus: caller lacks ACCESS_ROLE"
        );
        invites[inviteID].status = newStatus;
        return invites[inviteID].referrer;
    }

    function getInviteStatus(
        bytes32 inviteID
    ) public view returns (InviteStatus) {
        return invites[inviteID].status;
    }

    function getInviteReferrer(bytes32 inviteID) public view returns (address) {
        return invites[inviteID].referrer;
    }

    struct InviteSummary {
        bytes32 inviteId;
        InviteStatus status;
        address referrer;
    }

    function getReferrerInvites(
        address user
    ) public view returns (InviteSummary[] memory) {
        bytes32[] memory inviteIds = userInvites[user];
        InviteSummary[] memory summaries = new InviteSummary[](
            inviteIds.length
        );
        for (uint256 i = 0; i < inviteIds.length; i++) {
            summaries[i] = InviteSummary({
                inviteId: inviteIds[i],
                status: getInviteStatus(inviteIds[i]),
                referrer: user
            });
        }
        return summaries;
    }
}
