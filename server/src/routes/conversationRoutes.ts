import { Router } from 'express';
import { ConversationController } from '../controllers/conversationController.js';
import { MessageController } from '../controllers/messageController.js';
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

// Send message within conversation
router.post('/:conversationId/messages', MessageController.sendMessage);

// Retrieve messages within conversation (paginated)
router.get('/:conversationId/messages', MessageController.getMessages);

// Mark conversation messages as read
router.post('/:conversationId/read', MessageController.markRead);

export default router;
