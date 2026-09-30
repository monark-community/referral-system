// Purpose: Shared test data builders so each test only spells out the fields it cares about

import type { User } from "@/lib/api/auth";
import type { Invite, ReferralReward } from "@/lib/api/user";

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    walletAddress: "0x1111111111111111111111111111111111111111",
    name: "Alice",
    email: "alice@example.com",
    phone: null,
    emailVerified: true,
    referralCode: "ALICE12345",
    earnedPoints: 0,
    pendingPoints: 0,
    milestoneLevel: 0,
    disabledAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: "invite-1",
    referrer: buildUser(),
    referee: buildUser({
      id: "user-2",
      name: "Bob",
      walletAddress: "0x2222222222222222222222222222222222222222",
    }),
    status: 0,
    points: 100,
    isVerified: true,
    description: "",
    createdAt: "2026-09-10",
    updatedAt: "2026-09-10",
    ...overrides,
  };
}

export function buildReward(overrides: Partial<ReferralReward> = {}): ReferralReward {
  return {
    id: "reward-1",
    transactionHash: "0xabc",
    blockNumber: "10",
    logIndex: 0,
    participant: {
      walletAddress: "0x2222222222222222222222222222222222222222",
      name: "Bob",
    },
    referralLevel: 1,
    points: 80,
    pointPool: 100,
    unallocatedPoints: 0,
    observedAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}
