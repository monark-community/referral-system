// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Holds the status of a referrer's invite status
// Notes:
// - Currently status can be PENDING, ACCEPTED, or CLOSED
// - OpenZeppelin access control limits state changes to ReferralProgram.sol; the deployer retains only role administration
// - Pending private invites and accepted public-referral occurrences use the same lookup storage

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
        _grantRole(ACCESS_ROLE, access_role);
    }

    function createPendingInvite(
        bytes32 inviteID,
        address user
    ) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "createPendingInvite: caller lacks ACCESS_ROLE"
        );
        require(
            invites[inviteID].referrer == address(0),
            "Invite ID already exists"
        );
        require(user != address(0), "Invalid referrer");
        invites[inviteID] = Invite({referrer: user, status: InviteStatus.Pending});
        userInvites[user].push(inviteID);
    }

    function acceptPendingInvite(bytes32 inviteID) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "acceptPendingInvite: caller lacks ACCESS_ROLE"
        );
        require(invites[inviteID].referrer != address(0), "Invite not found");
        require(
            invites[inviteID].status == InviteStatus.Pending,
            "Invite not pending"
        );
        invites[inviteID].status = InviteStatus.Accepted;
    }

    function closePendingInvite(bytes32 inviteID) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "closePendingInvite: caller lacks ACCESS_ROLE"
        );
        require(invites[inviteID].referrer != address(0), "Invite not found");
        require(
            invites[inviteID].status == InviteStatus.Pending,
            "Invite not pending"
        );
        invites[inviteID].status = InviteStatus.Closed;
    }

    function recordAcceptedPublicReferral(
        bytes32 referralID,
        address referrer
    ) public {
        require(
            hasRole(ACCESS_ROLE, msg.sender),
            "recordAcceptedPublicReferral: caller lacks ACCESS_ROLE"
        );
        require(
            invites[referralID].referrer == address(0),
            "Invite ID already exists"
        );
        require(referrer != address(0), "Invalid referrer");
        invites[referralID] = Invite({
            referrer: referrer,
            status: InviteStatus.Accepted
        });
        userInvites[referrer].push(referralID);
    }

    function inviteExists(bytes32 inviteID) public view returns (bool) {
        return invites[inviteID].referrer != address(0);
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
