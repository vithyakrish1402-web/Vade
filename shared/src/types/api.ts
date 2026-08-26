export type ErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export type DatabaseStatus = 'connected' | 'disconnected' | 'unreachable' | 'disabled';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp?: string;
  uptime?: number;
  database?: DatabaseStatus;
  version?: string;
}
