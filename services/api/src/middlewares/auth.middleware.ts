import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../services/auth.service';
import pool from '../db/connection';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        walletAddress: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const payload = verifyJWT(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Check if user still exists
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, wallet_address FROM users WHERE id = $1',
        [payload.userId]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Attach user to request
      req.user = {
        id: result.rows[0].id,
        walletAddress: result.rows[0].wallet_address,
      };
      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}
