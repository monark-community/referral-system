# /service/api

> Backend handling the user data, through a RESTful API

- **Scope**: Express.js API presenting logic and data via Prisma/Postgres DB and on chain data
- **Purpose**: Handles and processes the app data - pushing personal information to the DB, and transparent data to the chain

## Notes

- [.env.example](.env.example) has the example configurations used by the API, to use it, fil them in a seperate file named .env

## Content

- [pacakge.json](package.json) file Node.js project type, config, scripts
- [src/](src/) - Source files
  - [src/index.js](src/index.ts) - Main file loading the express app
  - [src/routes/](src/routes/) - Handles the API endpoints
    - [src/routes/auth.routes.ts](src/routes/auth.routes.ts) - Authentication endpoints
    - [src/routes/milestone.routes.ts](src/routes/milestone.routes.ts) - Milestone endpoints
    - [src/routes/user.routes.ts](src/routes/user.routes.ts) - User information endpoints
  - [src/controllers/](src/controllers/) - Logic called by routes to handle the endpoint functions
    - [src/controllers/src/controllers/auth.controller.ts](src/controllers/auth.controller.ts)
    - [src/controllers/src/controllers/milestone.controller.ts](src/controllers/milestone.controller.ts)
    - [src/controllers/src/controllers/user.controller.ts](src/controllers/user.controller.ts)
  - [src/services/](src/services/) - Services and logic that process information
    - [src/services/auth.service.ts](src/services/auth.service.ts) - Authenticate the user
    - [src/services/blockchainListener.service.ts](src/services/blockchainListener.service.ts) - Listeners that synchronize the DB to the chain
    - [src/services/email.service.ts](src/services/email.service.ts) - Creates and serves emails to users
  - [src/middlewares/](src/middlewares/) - Middlewares to be used by the API i.e. calling external code
    - [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts)
    - [src/middlewares/error.middleware.ts](src/middlewares/error.middleware.ts)
    - [src/middlewares/validation.middleware.ts](src/middlewares/validation.middleware.ts)
  - [lib/](lib/) - library folder i.e. for prisma use
- [test/](test/) - Test folder, providing code coverage for the API - called using `npm run test`
