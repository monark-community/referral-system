# /services/api/prisma

> Prisma schema, seed data, and ordered database migrations for the API.

## Core Files

- [schema.prisma](schema.prisma) - Users, referrals, chain projections, and campaign persistence.
- [seed.ts](seed.ts) - Baseline milestone tier seed data.
- [migrations/20261010150000_add_campaign_foundation/migration.sql](migrations/20261010150000_add_campaign_foundation/migration.sql) - Additive campaign tables and built-in Referral definition.

Create schema changes through a new migration; do not rewrite migrations that may already have
been applied.
