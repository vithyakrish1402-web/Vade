import { Router } from 'express';
import { HealthController } from '../controllers/healthController.js';

const router = Router();

// GET /api/health (Liveness)
router.get('/', HealthController.checkHealth);

// GET /api/health/ready (Readiness)
router.get('/ready', HealthController.checkReadiness);

export default router;
