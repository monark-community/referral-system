// Purpose: Jest setup file for blockchain-connector tests
// Notes:
// - Loads test-specific environment variables before test execution

import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });