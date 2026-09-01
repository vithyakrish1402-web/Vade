import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import {
  registerIpRateLimiter,
  loginIpRateLimiter,
  loginIdentifierRateLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// Registration. Its own budget, separate from login (Phase 0B — Increment 2, H-6): a
// shared bucket meant sign-up traffic could lock existing users out of signing in.
router.post('/register', registerIpRateLimiter, AuthController.register);

// Login. Two independent dimensions: the source address (concentrated abuse from one
// client) and the targeted account (a distributed brute force that rotates addresses).
router.post('/login', loginIpRateLimiter, loginIdentifierRateLimiter, AuthController.login);

// Current user state
router.get('/me', optionalAuth, AuthController.getMe);

// Logout
router.post('/logout', optionalAuth, AuthController.logout);

export default router;
