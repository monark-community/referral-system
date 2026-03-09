import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  sendVerificationEmail,
  verifyEmail,
  validateReferralCode,
  getInvites,
  disableAccount,
  enableAccount,
} from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateProfileUpdate } from '../middlewares/validation.middleware.js';

const router = Router();

// GET /api/users/profile - Get user profile
router.get('/profile', authMiddleware, getProfile);

// PUT /api/users/profile - Update user profile (name, email, phone)
router.put('/profile', authMiddleware, validateProfileUpdate, updateProfile);

// POST /api/users/verify-email/send - Send email verification
router.post('/verify-email/send', authMiddleware, sendVerificationEmail);

// GET /api/users/referral/:code - Validate referral code
router.get('/referral/:code', validateReferralCode);

// GET /api/users/verify-email/:token - Verify email from link
router.get('/verify-email/:token', verifyEmail);

router.get('/referrals', authMiddleware, getInvites);

// POST /api/users/disable - Disable account
router.post('/disable', authMiddleware, disableAccount);

// POST /api/users/enable - Re-enable account
router.post('/enable', authMiddleware, enableAccount);

export default router;
