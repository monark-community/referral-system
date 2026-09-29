// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Splits an integer reward pool between the two supported referral levels.
// The math is deliberately unaware of points so it can be reused by a future reward
// implementation without representing reward types that do not exist yet.
library ReferralAllocation {
    uint16 internal constant BASIS_POINTS = 10_000;

    error InvalidReferralSplit(uint16 directBps, uint16 grandparentBps);

    struct Allocation {
        address directRecipient;
        address grandparentRecipient;
        uint256 directAmount;
        uint256 grandparentAmount;
        uint256 unallocatedAmount;
    }

    function validateSplit(
        uint16 directBps,
        uint16 grandparentBps
    ) internal pure {
        if (
            directBps == 0 ||
            uint256(directBps) + uint256(grandparentBps) != BASIS_POINTS
        ) {
            revert InvalidReferralSplit(directBps, grandparentBps);
        }
    }

    function allocate(
        uint256 pool,
        address directRecipient,
        address grandparentRecipient,
        uint16 directBps,
        uint16 grandparentBps
    ) internal pure returns (Allocation memory allocation) {
        validateSplit(directBps, grandparentBps);

        allocation.directRecipient = directRecipient;
        allocation.grandparentRecipient = grandparentRecipient;

        if (directRecipient == address(0)) {
            allocation.grandparentRecipient = address(0);
            allocation.unallocatedAmount = pool;
            return allocation;
        }

        if (grandparentRecipient == address(0)) {
            allocation.directAmount = pool;
            return allocation;
        }

        allocation.grandparentAmount =
            (pool * grandparentBps) /
            BASIS_POINTS;
        allocation.directAmount = pool - allocation.grandparentAmount;
    }
}
