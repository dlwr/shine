import type {Context} from 'hono';
import {
	type ApiErrorResponse,
	type AuthenticationError,
	type ConflictError,
	type DatabaseError,
	type ExternalApiError,
	type NotFoundError,
	type RateLimitError,
	type ValidationError,
	ErrorCodes,
} from '../types/errors.js';

export function createValidationError(
	c: Context,
	validationErrors: Array<{field: string; message: string}>,
): Response {
	const errorResponse: ValidationError = {
		error: 'Validation failed',
		code: ErrorCodes.VALIDATION_ERROR,
		details: validationErrors,
	};
	return c.json(errorResponse, 400);
}

export function createDatabaseError(
	c: Context,
	operation: string,
	table?: string,
	originalError?: unknown,
): Response {
	console.error(
		`Database error in ${operation}${table ? ` on table ${table}` : ''}:`,
		originalError,
	);

	const errorResponse: DatabaseError = {
		error: 'Database operation failed',
		code: ErrorCodes.DATABASE_ERROR,
		details: {
			operation,
			table,
		},
	};
	return c.json(errorResponse, 500);
}

export function createExternalApiError(
	c: Context,
	service: string,
	statusCode?: number,
	originalError?: unknown,
): Response {
	console.error(`External API error for ${service}:`, originalError);

	const errorResponse: ExternalApiError = {
		error: `External service ${service} is unavailable`,
		code: ErrorCodes.EXTERNAL_API_ERROR,
		details: {
			service,
			statusCode,
		},
	};
	return c.json(errorResponse, 503);
}

export function createRateLimitError(
	c: Context,
	resetTime: number,
	limit: number,
): Response {
	const errorResponse: RateLimitError = {
		error: 'Rate limit exceeded',
		code: ErrorCodes.RATE_LIMIT_EXCEEDED,
		details: {
			resetTime,
			limit,
		},
	};
	return c.json(errorResponse, 429);
}

export function createAuthenticationError(
	c: Context,
	reason:
		| 'INVALID_TOKEN'
		| 'EXPIRED_TOKEN'
		| 'MISSING_TOKEN'
		| 'INVALID_CREDENTIALS',
): Response {
	const messages = {
		INVALID_TOKEN: 'Invalid authentication token',
		EXPIRED_TOKEN: 'Authentication token has expired',
		MISSING_TOKEN: 'Authentication token is required',
		INVALID_CREDENTIALS: 'Invalid credentials provided',
	};

	const errorResponse: AuthenticationError = {
		error: messages[reason],
		code: ErrorCodes.AUTHENTICATION_ERROR,
		details: {reason},
	};
	return c.json(errorResponse, 401);
}

export function createNotFoundError(
	c: Context,
	resource: string,
	identifier: string,
): Response {
	const errorResponse: NotFoundError = {
		error: `${resource} not found`,
		code: ErrorCodes.NOT_FOUND,
		details: {
			resource,
			identifier,
		},
	};
	return c.json(errorResponse, 404);
}

export function createConflictError(
	c: Context,
	resource: string,
	constraint: string,
): Response {
	const errorResponse: ConflictError = {
		error: `${resource} already exists`,
		code: ErrorCodes.CONFLICT,
		details: {
			resource,
			constraint,
		},
	};
	return c.json(errorResponse, 409);
}

export function createInternalServerError(
	c: Context,
	originalError?: unknown,
	context?: string,
): Response {
	console.error(
		`Internal server error${context ? ` in ${context}` : ''}:`,
		originalError,
	);

	const errorResponse: ApiErrorResponse = {
		error: 'Internal server error',
		code: ErrorCodes.INTERNAL_ERROR,
	};
	return c.json(errorResponse, 500);
}

export function isValidationError(error: unknown): error is {
	issues: Array<{path: Array<string | number>; message: string}>;
} {
	return (
		typeof error === 'object' &&
		error !== null &&
		'issues' in error &&
		Array.isArray((error as {issues: unknown}).issues)
	);
}

export function formatZodErrors(zodError: {
	issues: Array<{path: Array<string | number>; message: string}>;
}): Array<{field: string; message: string}> {
	return zodError.issues.map((issue) => ({
		field: issue.path.join('.') || 'root',
		message: issue.message,
	}));
}
