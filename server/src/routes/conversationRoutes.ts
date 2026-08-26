import { Router } from 'express';
import { ConversationController } from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// All conversation routes require an active authenticated session
router.use(requireAuth);

// Create or get direct 1-to-1 conversation
router.post('/', ConversationController.createConversation);

// List active conversations for current user
router.get('/', ConversationController.listConversations);

// Retrieve single conversation details
router.get('/:id', ConversationController.getConversation);

export default router;
