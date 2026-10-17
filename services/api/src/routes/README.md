# /services/api/src/routes

> Route registration and authorization boundaries for the REST API.

## Core Files

- [index.ts](index.ts) - Mounts the API route groups.
- [auth.routes.ts](auth.routes.ts) - Wallet login and session routes.
- [user.routes.ts](user.routes.ts) - Profile and existing referral routes.
- [campaign.routes.ts](campaign.routes.ts) - Campaign reads, plus creating, submitting to and reviewing user campaigns.
- [milestone.routes.ts](milestone.routes.ts) - Public tiers and authenticated progress.

The `e2eMailbox` and `e2eReset` routers are guarded test-harness support and are not mounted
in normal environments.
