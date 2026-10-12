// Purpose: Root API router - mounts auth, user, and milestone route modules under /api

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import milestoneRoutes from './milestone.routes.js';
import campaignRoutes from './campaign.routes.js';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/campaigns', campaignRoutes);

export default router;
