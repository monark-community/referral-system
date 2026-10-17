# /services/api/src/services

> Application services for authentication, chain synchronization, campaigns, and email.

## Core Files

- [auth.service.ts](auth.service.ts) - Signature verification, JWTs, and referral-code helpers.
- [blockchainListener.service.ts](blockchainListener.service.ts) - Live event handling and startup catch-up.
- [campaign.service.ts](campaign.service.ts) - Loads and validates the built-in campaign definition.
- [campaignFulfillment.service.ts](campaignFulfillment.service.ts) - Projects, reconciles, and reads campaign fulfillments.
- [manualCampaign.service.ts](manualCampaign.service.ts) - User campaign rules, and the contract calls the user's wallet sends.
- [manualCampaignProjection.service.ts](manualCampaignProjection.service.ts) - Applies the chain's user campaign events to the database.
- [email.service.ts](email.service.ts) - Production and guarded in-memory email delivery.
- [index.ts](index.ts) - Service exports.

The campaign fulfillment service is a sidecar to the existing referral projections; it does not
write to the contract or award points. User campaigns never write to the contract either: the
user's wallet sends each transaction, the contract pays the points, and the listener records it.
