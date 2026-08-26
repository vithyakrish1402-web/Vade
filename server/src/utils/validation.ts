import { z } from 'zod';

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username must be at most 30 characters long')
    .regex(USERNAME_REGEX, 'Username may only contain letters, numbers, underscores, and hyphens')
    .transform((val) => val.toLowerCase()),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(255, 'Email is too long')
    .email('Invalid email address format')
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must be at most 128 characters long'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name cannot be empty')
    .max(50, 'Display name must be at most 50 characters long')
    .optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name cannot be empty')
      .max(50, 'Display name must be at most 50 characters long')
      .optional(),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters long')
      .max(30, 'Username must be at most 30 characters long')
      .regex(USERNAME_REGEX, 'Username may only contain letters, numbers, underscores, and hyphens')
      .transform((val) => val.toLowerCase())
      .optional(),
  })
  .refine((data) => data.displayName !== undefined || data.username !== undefined, {
    message: 'At least one field (displayName or username) must be provided for update',
  });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(50, 'Search query is too long'),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(50, Math.max(1, parseInt(val, 10) || 20)) : 20)),
});

export const createConversationSchema = z
  .object({
    userId: z.string().uuid('Invalid user ID format').optional(),
    recipientId: z.string().uuid('Invalid recipient ID format').optional(),
    recipientUsername: z
      .string()
      .trim()
      .min(3, 'Recipient username must be at least 3 characters')
      .max(30)
      .transform((val) => val.toLowerCase())
      .optional(),
  })
  .refine(
    (data) =>
      data.userId !== undefined ||
      data.recipientId !== undefined ||
      data.recipientUsername !== undefined,
    {
      message: 'A target userId, recipientId, or recipientUsername must be provided',
    }
  );

export const conversationListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(50, Math.max(1, parseInt(val, 10) || 20)) : 20)),
});

// Phase 7: Public Key Distribution Schema
export const publishKeySchema = z.object({
  keyId: z.string().trim().min(1, 'Key ID is required').max(100),
  publicKey: z.string().trim().min(1, 'Public key is required').max(5000),
  algorithm: z.string().trim().default('ECDH-P256'),
});

// Phase 7: E2EE Encrypted Message Schema
export const encryptedEnvelopeSchema = z.object({
  version: z.number().int().min(1, 'Unsupported protocol version'),
  algorithm: z.string().min(1, 'Algorithm is required'),
  keyAgreement: z.string().min(1, 'Key agreement is required'),
  senderKeyId: z.string().min(1, 'Sender key ID is required'),
  recipientKeyId: z.string().min(1, 'Recipient key ID is required'),
  nonce: z.string().min(1, 'Nonce is required').max(100),
  ciphertext: z
    .string()
    .min(1, 'Ciphertext is required')
    .max(65536, 'Ciphertext exceeds maximum payload size of 64KB'),
  aad: z.string().max(1000).optional(),
});

export const sendMessageSchema = z.object({
  envelope: encryptedEnvelopeSchema,
  tempId: z.string().max(100).optional(),
});

export const messagePaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 50)) : 50)),
  before: z.string().optional(),
});
