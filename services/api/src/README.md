# /services/api/src

> Main source tree for the Express API and its blockchain-backed projections.

- **Scope**: HTTP routes, controllers, domain models, services, middleware, and database access.
- **Purpose**: Keeps transport, validation, application logic, and chain synchronization separated.

## Key Paths

- [app.ts](app.ts) - Builds the Express application, health checks, and route mounting.
- [index.ts](index.ts) - Starts the HTTP server and blockchain listener.
- [readiness.ts](readiness.ts) - Tracks startup and shutdown readiness.
- [controllers/README.md](controllers/README.md) - Request handlers and response mapping.
- [routes/README.md](routes/README.md) - Public and authenticated endpoint registration.
- [services/README.md](services/README.md) - Authentication, campaign, email, and listener logic.
- [models/README.md](models/README.md) - Domain types and strict campaign parsing.
- [middlewares/README.md](middlewares/README.md) - Authentication, validation, and error middleware.
- [lib/README.md](lib/README.md) - Shared infrastructure utilities.
