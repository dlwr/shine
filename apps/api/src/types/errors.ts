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

export type ApiErrorResponse =
  | ApiError
  | ValidationError
  | RateLimitError
  | AuthenticationError;

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
