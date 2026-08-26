import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import cryptoRoutes from './cryptoRoutes.js';

const apiRouter = Router();

// Mount routes
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/conversations', conversationRoutes);
apiRouter.use('/crypto', cryptoRoutes);

export default apiRouter;
