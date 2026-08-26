import { Router } from 'express';
import { HealthController } from '../controllers/healthController.js';

const router = Router();

// GET /api/health
router.get('/', HealthController.checkHealth);

export default router;
