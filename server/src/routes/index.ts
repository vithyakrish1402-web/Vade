import { Router } from 'express';
import healthRoutes from './healthRoutes.js';

const apiRouter = Router();

// Mount routes
apiRouter.use('/health', healthRoutes);

export default apiRouter;
