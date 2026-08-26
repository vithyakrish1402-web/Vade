import { Router } from 'express';
import { cryptoController } from '../controllers/cryptoController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all crypto routes with authentication
router.use(requireAuth);

// POST /api/crypto/identity
router.post('/identity', (req, res, next) => cryptoController.publishIdentityKey(req, res, next));

// GET /api/crypto/users/:userId/key
router.get('/users/:userId/key', (req, res, next) => cryptoController.getUserPublicKey(req, res, next));

export default router;
