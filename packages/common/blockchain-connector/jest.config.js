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
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    // Fix relative JS imports for ESM
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Map the hoisted dependency
    '^@reffinity/common-contracts$': path.resolve(__dirname, '../../../node_modules/@reffinity/common-contracts'),
  },
  setupFiles: ['./jest.setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/../../../node_modules'],
};