# /services/api

> Backend handling the user data, through a RESTful API

- **Scope**: Express.js API presenting logic and data via Prisma/Postgres DB and on chain data
- **Purpose**: Handles and processes the app data - pushing personal information to the DB, and transparent data to the chain

## Notes

- [.env.example](.env.example) has example API configuration values; copy into a local .env file and fill real values.

## Content

- [package.json](package.json) - Node.js package scripts and dependencies.
- [src/README.md](src/README.md) - Source map and key runtime entry points
  - [src/index.ts](src/index.ts) - Main file loading the Express app
  - [src/routes/](src/routes/) - Handles the API endpoints
    - [src/routes/auth.routes.ts](src/routes/auth.routes.ts) - Authentication endpoints
    - [src/routes/campaign.routes.ts](src/routes/campaign.routes.ts) - Campaign definition and fulfillment endpoints
    - [src/routes/milestone.routes.ts](src/routes/milestone.routes.ts) - Milestone endpoints
    - [src/routes/user.routes.ts](src/routes/user.routes.ts) - User information endpoints
  - [src/controllers/](src/controllers/) - Logic called by routes to handle the endpoint functions
    - [src/controllers/auth.controller.ts](src/controllers/auth.controller.ts)
    - [src/controllers/campaign.controller.ts](src/controllers/campaign.controller.ts) - Campaign response mapping
    - [src/controllers/milestone.controller.ts](src/controllers/milestone.controller.ts)
    - [src/controllers/user.controller.ts](src/controllers/user.controller.ts)
  - [src/services/](src/services/) - Services and logic that process information
    - [src/services/auth.service.ts](src/services/auth.service.ts) - Authenticate the user
    - [src/services/blockchainListener.service.ts](src/services/blockchainListener.service.ts) - Listeners that synchronize the DB to the chain
    - [src/services/campaign.service.ts](src/services/campaign.service.ts) - Built-in campaign definition loader
    - [src/services/campaignFulfillment.service.ts](src/services/campaignFulfillment.service.ts) - Fulfillment projection and recovery
    - [src/services/email.service.ts](src/services/email.service.ts) - Creates and serves emails to users
  - [src/middlewares/](src/middlewares/) - Middlewares to be used by the API i.e. calling external code
    - [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts)
    - [src/middlewares/error.middleware.ts](src/middlewares/error.middleware.ts)
    - [src/middlewares/validation.middleware.ts](src/middlewares/validation.middleware.ts)
  - [src/lib/](src/lib/) - Internal library utilities (Prisma client singleton)
- [../docs/API.md](../../docs/API.md#campaigns) - Campaign and fulfillment API contract
- [prisma/README.md](prisma/README.md) - Database schema, seed, and key migrations
- [test/](test/) - Test suite for controllers/services; run with npm run test
