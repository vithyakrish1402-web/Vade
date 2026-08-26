export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'auth',
  'authorization',
  'secret',
  'key',
  'privatekey',
  'encryptionkey',
  'gesture',
  'gestures',
  'gesturedata',
  'gesturesequence',
  'plaintext',
  'messagecontent',
  'body',
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((item, idx) => sanitizeValue(String(idx), item));
    }
    const sanitizedObj: Record<string, unknown> = {};
    for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
      sanitizedObj[subKey] = sanitizeValue(subKey, subVal);
    }
    return sanitizedObj;
  }

  return value;
}

export function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return sanitizeValue('root', metadata) as Record<string, unknown>;
}

class Logger {
  private formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = sanitizeMetadata(meta);
    const metaString = sanitizedMeta && Object.keys(sanitizedMeta).length > 0
      ? ` ${JSON.stringify(sanitizedMeta)}`
      : '';

    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.debug(this.formatLog('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.formatLog('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.formatLog('warn', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(this.formatLog('error', message, meta));
  }
}

export const logger = new Logger();
