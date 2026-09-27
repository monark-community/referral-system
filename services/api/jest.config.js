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
    "^@/(.*)$": "<rootDir>/src/$1"
  },

  extensionsToTreatAsEsm: [".ts"],

  transform: {
    // 151002 is a harmless module-kind warning that ts-jest prints once per test file
    "^.+\\.ts$": ["ts-jest", { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },

  // Count every source file in coverage, not just the ones a test imports
  collectCoverageFrom: ["src/**/*.ts"],
};
