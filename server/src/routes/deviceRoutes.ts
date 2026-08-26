import { Router } from 'express';
import { deviceController } from '../controllers/deviceController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// All device management routes require authentication
router.use(requireAuth);

router.get('/', (req, res, next) => deviceController.listDevices(req, res, next));
router.post('/register', (req, res, next) => deviceController.registerDevice(req, res, next));
router.post('/:id/revoke', (req, res, next) => deviceController.revokeDevice(req, res, next));

export { router as deviceRoutes };
