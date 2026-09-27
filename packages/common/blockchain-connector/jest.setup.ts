// Purpose: Jest setup file for blockchain-connector tests
// Notes:
// - Loads test-specific environment variables before test execution
// - Falls back to local Hardhat URLs, since .env.* files are gitignored and .env.test may not exist

import dotenv from 'dotenv';

dotenv.config({ path: '.env.test', quiet: true });

process.env.RPC_URL ??= 'http://127.0.0.1:8545';
process.env.RPC_WEBSOCKET_URL ??= 'ws://127.0.0.1:8545';
