// authentication api routing
// exposes registration and login endpoints
// handles otp request and verification triggers
// mounts profile and self-identification routes
// secures member-only routes with jwt middleware

import { Router } from 'express';
import { AuthController } from '../modules/auth/auth.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// post /api/auth/register
router.post('/register', AuthController.register);
router.post('/request-otp', AuthController.requestOtp);

// post /api/auth/login
router.post('/login', AuthController.login);

// get /api/auth/me  (protected)
router.get('/me', authMiddleware, AuthController.me);

// patch /api/auth/me (protected)
router.patch('/me', authMiddleware, AuthController.updateMe);

export default router;
