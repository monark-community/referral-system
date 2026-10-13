// Purpose: Unit tests for the switch that turns on the E2E state reset
// Notes:
// - The reset wipes the database and rewinds the chain, so it must stay off unless every E2E setting is present
// - Only the switch is tested here; the reset itself runs for real in e2e/tests/state-reset.spec.ts

import { isE2EResetConfigured } from "@/services/e2eReset.service.js";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const originalEnv = process.env;

// The four settings that together turn the reset on
const e2eSettings = {
  NODE_ENV: "test",
  E2E_ENABLE_STATE_RESET: "true",
  E2E_RESET_KEY: "reset-key-1234567890",
  CHAIN_TYPE: "localhost",
};

function setEnv(settings: Record<string, string | undefined>) {
  process.env = { ...originalEnv, ...settings } as NodeJS.ProcessEnv;
}

describe("E2E state reset switch", () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  test("is on when every E2E setting is present", () => {
    setEnv(e2eSettings);

    expect(isE2EResetConfigured()).toBe(true);
  });

  test.each([
    ["outside NODE_ENV=test", { NODE_ENV: "production" }],
    ["without the enable flag", { E2E_ENABLE_STATE_RESET: undefined }],
    ["when the enable flag is not exactly true", { E2E_ENABLE_STATE_RESET: "1" }],
    ["without a reset key", { E2E_RESET_KEY: undefined }],
    ["with a reset key shorter than 16 characters", { E2E_RESET_KEY: "short-key" }],
    ["on a chain other than localhost", { CHAIN_TYPE: "sepolia" }],
  ])("stays off %s", (_case, override) => {
    setEnv({ ...e2eSettings, ...override });

    expect(isE2EResetConfigured()).toBe(false);
  });
});
