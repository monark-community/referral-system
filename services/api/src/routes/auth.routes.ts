import { Router } from 'express';
import { walletAuth, getMe, logout } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateWalletAuth } from '../middlewares/validation.middleware';

const router = Router();

// POST /api/auth/wallet - Authenticate with wallet signature
router.post('/wallet', validateWalletAuth, walletAuth);

// GET /api/auth/me - Get current authenticated user
router.get('/me', authMiddleware, getMe);

// POST /api/auth/logout - Logout (optional, mainly for session cleanup)
router.post('/logout', authMiddleware, logout);

export default router;
