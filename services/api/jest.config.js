export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",        // fix relative .js imports
    "^@/(.*)\\.js$": "<rootDir>/src/$1", // fix alias .js imports
    "^@/(.*)$": "<rootDir>/src/$1"
  },

  extensionsToTreatAsEsm: [".ts"],

  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
};
