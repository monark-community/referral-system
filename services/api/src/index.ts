// Purpose: API service entrypoint - starts the HTTP server and the background blockchain listener
// Notes:
// - The Express app itself is built in app.ts, so tests can use it without starting anything
// - Initializes BlockchainListenerService at startup to sync on-chain events into the database

import app from './app.js';
import { markNotReady, markReady } from './readiness.js';
import { BlockchainListenerService } from './services/blockchainListener.service.js';
import { initializeE2EReset } from './services/e2eReset.service.js';

const PORT = process.env.PORT || 3001;

// Start HTTP immediately so liveness and startup readiness remain distinguishable.
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API available at http://localhost:${PORT}/api`);
});

// Blockchain listener service. Readiness is published only after database catch-up and
// all event subscriptions have initialized.
const blockchainListener = new BlockchainListenerService();
blockchainListener.initialize()
  .then(async () => {
    await initializeE2EReset(blockchainListener);
    markReady();
  })
  .catch(error => {
    markNotReady('blockchain_listener_failed');
    console.error('Failed to initialize blockchain listener:', error);
    server.close(() => process.exit(1));
  });

process.on('SIGTERM', async () => {
  markNotReady('shutting_down');
  await blockchainListener.stop();
  console.log('Shutting down gracefully');
  server.close();
});

export default app;
