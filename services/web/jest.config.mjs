// Purpose: Jest configuration for web UI tests (components, pages, hooks, and API helpers)
// Notes:
// - next/jest compiles TS/TSX with SWC, loads the Next config and .env files, and stubs CSS/image imports
// - Tests run in jsdom so components can be rendered with React Testing Library

import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

export default createJestConfig({
  testEnvironment: "jsdom",

  testMatch: ["<rootDir>/test/**/*.test.{ts,tsx}"],

  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Count every source file in coverage, not just the ones a test imports
  collectCoverageFrom: ["src/**/*.{ts,tsx}"],
});
