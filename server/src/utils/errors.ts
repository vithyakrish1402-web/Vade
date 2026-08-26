import type { ErrorCode } from '@enctxt/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    isOperational = true,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Invalid request', details?: unknown): AppError {
    return new AppError(400, 'INVALID_REQUEST', message, true, details);
  }

  static validationFailed(message = 'Validation failed', details?: unknown): AppError {
    return new AppError(422, 'VALIDATION_FAILED', message, true, details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static authenticationFailed(message = 'Authentication failed'): AppError {
    return new AppError(401, 'AUTHENTICATION_FAILED', message);
  }

  static forbidden(message = 'Access forbidden'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'RESOURCE_NOT_FOUND', message);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message, false);
  }
}
