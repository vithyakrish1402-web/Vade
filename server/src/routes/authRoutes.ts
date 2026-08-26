import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Registration
router.post('/register', authRateLimiter, AuthController.register);

// Login
router.post('/login', authRateLimiter, AuthController.login);

// Current user state
router.get('/me', optionalAuth, AuthController.getMe);

// Logout
router.post('/logout', optionalAuth, AuthController.logout);

export default router;
