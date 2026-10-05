// Purpose: Builds the Express app - security headers, CORS, JSON parsing, routes, and error handling
// Notes:
// - Only builds the app; it starts no server and no blockchain listener, so tests can import it safely
// - Exposes /health for basic service monitoring
// - index.ts imports this app and starts the server and listener

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { getReadiness } from './readiness.js';
import e2eMailboxRoutes from './routes/e2eMailbox.routes.js';
import { isE2EMailboxConfigured } from './services/e2eMailbox.service.js';
import e2eResetRoutes from './routes/e2eReset.routes.js';
import { isE2EResetConfigured } from './services/e2eReset.service.js';

// Load environment variables
dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Middleware
app.use(helmet());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness includes database catch-up and live blockchain event subscriptions.
app.get('/ready', (_req, res) => {
  const readiness = getReadiness();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

// This route is absent unless the process is explicitly running the guarded E2E mailbox.
if (isE2EMailboxConfigured()) {
  app.use('/__e2e', e2eMailboxRoutes);
}
if (isE2EResetConfigured()) {
  app.use('/__e2e', e2eResetRoutes);
}

// API Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

export default app;
