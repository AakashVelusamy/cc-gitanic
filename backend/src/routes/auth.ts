/**
 * routes/auth.ts — Auth router
 *
 * Mounts all /api/auth/* endpoints and applies middleware.
 */

import { Router } from 'express';
import { AuthController } from '../modules/auth/auth.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// POST /api/auth/register
router.post('/register', AuthController.register);
router.post('/request-otp', AuthController.requestOtp);

// POST /api/auth/login
router.post('/login', AuthController.login);

// GET /api/auth/me  (protected)
router.get('/me', authMiddleware, AuthController.me);

// PATCH /api/auth/me (protected)
router.patch('/me', authMiddleware, AuthController.updateMe);

export default router;
