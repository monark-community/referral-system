// Purpose: Jest configuration for API unit/integration tests in TypeScript ESM mode
// Notes:
// - Rewrites .js import specifiers so ts-jest resolves TS source files correctly

export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  testMatch: ["<rootDir>/test/**/*.test.ts"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",        // fix relative .js imports
    "^@/(.*)\\.js$": "<rootDir>/src/$1", // fix alias .js imports
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@reffinity/common-contracts$": "<rootDir>/../../packages/common/contracts/index.ts"
  },

  extensionsToTreatAsEsm: [".ts"],

  transform: {
    // 151002 is a harmless module-kind warning that ts-jest prints once per test file
    "^.+\\.ts$": ["ts-jest", { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },

  // Count every source file in coverage, not just the ones a test imports.
  // The E2E reset and mailbox helpers are left out: they only switch on inside the Playwright stack,
  // which exercises them for real (see e2e/README.md).
  collectCoverageFrom: ["src/**/*.ts", "!src/**/e2e*.ts"],
};
