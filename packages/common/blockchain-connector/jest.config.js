// Purpose: Jest configuration for blockchain-connector package tests
// Notes:
// - Uses ts-jest in ESM mode
// - Maps @reffinity/common-contracts to the hoisted workspace dependency

import path from 'path';
import { fileURLToPath } from 'url';

// Create __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // 151002 is a harmless module-kind warning that ts-jest prints once per test file
    '^.+\\.ts$': ['ts-jest', { useESM: true, diagnostics: { ignoreCodes: [151002] } }],
  },
  // Skip compiled copies of the tests that `npm run build` puts in dist/
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/'],
  moduleNameMapper: {
    // Fix relative JS imports for ESM
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Map the hoisted dependency
    '^@reffinity/common-contracts$': path.resolve(__dirname, '../../../node_modules/@reffinity/common-contracts'),
  },
  setupFiles: ['./jest.setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/../../../node_modules'],
  // Count every source file in coverage, not just the ones a test imports
  collectCoverageFrom: ['*.ts', '!jest.setup.ts'],
};