import { Router } from 'express';
import { UserController } from '../controllers/userController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Profile management (requires authentication)
router.get('/me', requireAuth, UserController.getProfile);
router.patch('/me', requireAuth, UserController.updateProfile);

// Search users (requires authentication)
router.get('/search', requireAuth, UserController.searchUsers);

export default router;
