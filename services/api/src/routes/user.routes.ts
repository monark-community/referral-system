import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  sendVerificationEmail,
  verifyEmail,
  deleteAccount
} from '../controllers/user.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateProfileUpdate } from '../middlewares/validation.middleware';

const router = Router();

// GET /api/users/profile - Get user profile
router.get('/profile', authMiddleware, getProfile);

// PUT /api/users/profile - Update user profile (name, email, phone)
router.put('/profile', authMiddleware, validateProfileUpdate, updateProfile);

// POST /api/users/verify-email/send - Send email verification
router.post('/verify-email/send', authMiddleware, sendVerificationEmail);

// GET /api/users/verify-email/:token - Verify email from link
router.get('/verify-email/:token', verifyEmail);

// DELETE /api/users/account - Delete user account
router.delete('/account', authMiddleware, deleteAccount);

export default router;
