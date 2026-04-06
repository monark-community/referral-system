// Purpose: Shared Prisma client singleton for API database access
// Notes:
// - Reuses a global instance in development to avoid exhausting DB connections during hot reloads

import { PrismaClient } from '@prisma/client';

// Prevent multiple Prisma Client instances in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
