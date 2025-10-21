export type ApiError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

export type ValidationError = {
  error: string;
  code: 'VALIDATION_ERROR';
  details: Array<{
    field: string;
    message: string;
  }>;
};

export type DatabaseError = {
  error: string;
  code: 'DATABASE_ERROR';
  details?: {
    operation: string;
    table?: string;
  };
};

export type ExternalApiError = {
  error: string;
  code: 'EXTERNAL_API_ERROR';
  details?: {
    service: string;
    statusCode?: number;
  };
};

export type RateLimitError = {
  error: string;
  code: 'RATE_LIMIT_EXCEEDED';
  details?: {
    resetTime: number;
    limit: number;
  };
};

export type AuthenticationError = {
  error: string;
  code: 'AUTHENTICATION_ERROR';
  details?: {
    reason:
      | 'INVALID_TOKEN'
      | 'EXPIRED_TOKEN'
      | 'MISSING_TOKEN'
      | 'INVALID_CREDENTIALS';
  };
};

export type NotFoundError = {
  error: string;
  code: 'NOT_FOUND';
  details?: {
    resource: string;
    identifier: string;
  };
};

export type ConflictError = {
  error: string;
  code: 'CONFLICT';
  details?: {
    resource: string;
    constraint: string;
  };
};

export type ApiErrorResponse =
  | ApiError
  | ValidationError
  | DatabaseError
  | ExternalApiError
  | RateLimitError
  | AuthenticationError
  | NotFoundError
  | ConflictError;

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
