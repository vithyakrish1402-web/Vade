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
    recipientId: z.string().uuid('Invalid recipient ID format').optional(),
    recipientUsername: z
      .string()
      .trim()
      .min(3, 'Recipient username must be at least 3 characters')
      .max(30)
      .transform((val) => val.toLowerCase())
      .optional(),
  })
  .refine((data) => data.recipientId !== undefined || data.recipientUsername !== undefined, {
    message: 'Either recipientId or recipientUsername must be provided',
  });
