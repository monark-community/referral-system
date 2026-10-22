// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Purpose: Defines the independent on-chain types shared by generalized campaigns.
// Notes:
// - A task describes what a participant does; verification describes how completion is approved.
// - Enum values only describe types. A separate campaign module decides which combinations work.
// - The built-in referral flow may remain specialized even though Referral is a known task type.
library CampaignTypes {
    enum TaskType {
        Referral,
        Bounty
    }

    enum VerificationType {
        AutomaticChain,
        Manual
    }

    // None makes an uninitialized mapping value distinguishable from an active campaign.
    enum CampaignStatus {
        None,
        Active,
        Archived
    }

    // How a campaign pays each completion. Points is the only kind so far; others, like tokens, can be added
    enum RewardType {
        Points,
        Direct
    }

    enum FulfillmentStatus {
        None,
        Submitted,
        Verified,
        Rejected
    }

    struct Campaign {
        bytes32 id;
        address owner;
        TaskType taskType;
        VerificationType verificationType;
        CampaignStatus status;
        RewardType rewardType;
        // Paid to whoever completes the task
        uint256 completerReward;
        // Split between the completer's referrer and grandparent, like a sign-up's referral pool
        uint256 referralPool;
        // For bounty type campaigns the balance is how much money remains
        uint256 balance;
    }

    struct Fulfillment {
        bytes32 id;
        bytes32 campaignId;
        address participant;
        FulfillmentStatus status;
    }
}
