# /packages/shared

> Cross-package reusable interfaces and helpers.

- **Scope**: Shared barrels intended for reuse across workspace packages/services.
- **Purpose**: Provides stable import points for contracts, shared types, and generic utilities.

## Notes

- This package currently acts as a structure-first shared layer and can grow with reusable runtime code.

## Content

- [contracts/index.ts](contracts/index.ts) - Shared contract-related exports.
- [types/index.ts](types/index.ts) - Shared TypeScript type export entry.
- [utils/index.ts](utils/index.ts) - Shared utility export entry.