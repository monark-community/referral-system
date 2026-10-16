# /services/api/src/middlewares

> Shared Express middleware for authentication, request validation, and errors.

## Core Files

- [auth.middleware.ts](auth.middleware.ts) - Validates JWTs and attaches the current user.
- [validation.middleware.ts](validation.middleware.ts) - Validates authentication and profile payloads.
- [error.middleware.ts](error.middleware.ts) - Maps unhandled errors to consistent JSON responses.
- [index.ts](index.ts) - Middleware exports.
