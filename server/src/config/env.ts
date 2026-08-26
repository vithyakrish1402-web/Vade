import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env or server-local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const envSchema = z
  .object({
    PORT: z
      .string()
      .default('5000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
          throw new Error('PORT must be a valid port number between 1 and 65535');
        }
        return parsed;
      }),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    JWT_SECRET: z
      .string()
      .default('development_jwt_secret_key_minimum_32_characters_long_for_security!'),
    SESSION_COOKIE_NAME: z.string().default('enctxt_session'),
    SESSION_MAX_AGE_DAYS: z
      .string()
      .default('7')
      .transform((val) => parseInt(val, 10)),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // Production Secret Strength Validation
      if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'Production JWT_SECRET must be at least 32 characters long',
        });
      }

      const lowerSecret = data.JWT_SECRET.toLowerCase();
      const insecurePatterns = ['development', 'changeme', 'password', 'default_secret', 'secret123'];
      if (insecurePatterns.some((pattern) => lowerSecret.includes(pattern))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'Production JWT_SECRET cannot contain default or development-only placeholder strings',
        });
      }

      // Production CORS Validation
      if (data.CORS_ORIGIN === '*' || data.CORS_ORIGIN.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'Production CORS_ORIGIN must be an explicit trusted origin and cannot be wildcard (*)',
        });
      }
    }
  });

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  return envSchema.safeParse(rawEnv);
}

const parsedEnv = validateEnv(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsedEnv.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nPlease verify your .env file or copy .env.example to .env');
  process.exit(1);
}

export const config = parsedEnv.data;
export type Config = typeof config;
