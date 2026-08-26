import type { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware to protect against XSS, clickjacking, MIME sniffing, and information leakage.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
  );

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (restrict sensitive features)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HSTS (HTTP Strict Transport Security) in production
  if (process.env.NODE_ENV === 'production' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
