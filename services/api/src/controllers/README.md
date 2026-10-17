# /services/api/src/controllers

> Express handlers that validate request context, call services, and map API responses.

## Core Files

- [auth.controller.ts](auth.controller.ts) - Wallet authentication and current-session responses.
- [user.controller.ts](user.controller.ts) - Profiles, verification, referral invites, rewards, and networks.
- [campaign.controller.ts](campaign.controller.ts) - Campaign definitions and current-user fulfillment status.
- [manualCampaign.controller.ts](manualCampaign.controller.ts) - User campaigns: creating, managing, submitting proof, and reviewing.
- [milestone.controller.ts](milestone.controller.ts) - Milestone tiers and user progression.
- [index.ts](index.ts) - Controller exports.
