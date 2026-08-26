import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.js';

describe('Production Configuration & Secret Strength Validation (Phase 10)', () => {
  it('passes validation for a strong, explicit production configuration', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgresql://enctxt_user:strong_password@localhost:5432/enctxt_prod',
      CORS_ORIGIN: 'https://app.enctxt.example.com',
      JWT_SECRET: 'a_very_strong_cryptographically_secure_random_production_secret_key_1234567890!',
    };

    const result = validateEnv(validProdEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.PORT).toBe(5000);
      expect(result.data.CORS_ORIGIN).toBe('https://app.enctxt.example.com');
    }
  });

  it('strictly rejects weak or short JWT_SECRET (< 32 characters) in production', () => {
    const shortSecretEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgresql://enctxt_user:pass@localhost:5432/enctxt_prod',
      CORS_ORIGIN: 'https://app.enctxt.example.com',
      JWT_SECRET: 'short_secret',
    };

    const result = validateEnv(shortSecretEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('JWT_SECRET'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('at least 32 characters');
    }
  });

  it('strictly rejects default development-only JWT_SECRET strings in production', () => {
    const devSecretInProd = {
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgresql://enctxt_user:pass@localhost:5432/enctxt_prod',
      CORS_ORIGIN: 'https://app.enctxt.example.com',
      JWT_SECRET: 'development_jwt_secret_key_minimum_32_characters_long_for_security!',
    };

    const result = validateEnv(devSecretInProd);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('JWT_SECRET'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('default or development-only');
    }
  });

  it('strictly rejects wildcard CORS_ORIGIN (*) in production', () => {
    const wildcardCorsEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      DATABASE_URL: 'postgresql://enctxt_user:pass@localhost:5432/enctxt_prod',
      CORS_ORIGIN: '*',
      JWT_SECRET: 'a_very_strong_cryptographically_secure_random_production_secret_key_1234567890!',
    };

    const result = validateEnv(wildcardCorsEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('CORS_ORIGIN'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('cannot be wildcard');
    }
  });
});
