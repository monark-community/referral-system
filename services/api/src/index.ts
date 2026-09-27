// Purpose: API service entrypoint - starts the HTTP server and the background blockchain listener
// Notes:
// - The Express app itself is built in app.ts, so tests can use it without starting anything
// - Initializes BlockchainListenerService at startup to sync on-chain events into the database

import app from './app.js';
import { BlockchainListenerService } from './services/blockchainListener.service.js';

const PORT = process.env.PORT || 3001;

//bolockchain listener service
const blockchainListener = new BlockchainListenerService();
blockchainListener.initialize().catch(error => {
  console.error('Failed to initialize blockchain listener:', error);
  process.exit(1);
});
process.on('SIGTERM', () => {
  blockchainListener.stop();
  console.log('Shutting down gracefully');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API available at http://localhost:${PORT}/api`);
});

export default app;
