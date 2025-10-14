import type {Context, MiddlewareHandler, Next} from 'hono';
import {
	createInternalServerError,
	createValidationError,
	formatZodErrors,
	isValidationError,
} from '../utils/error-handlers.js';

export const globalErrorHandler: MiddlewareHandler = async (
	c: Context,
	next: Next,
) => {
	try {
		await next();
	} catch (error) {
		if (isValidationError(error)) {
			const validationErrors = formatZodErrors(error);
			return createValidationError(c, validationErrors);
		}

		if (error instanceof Error) {
			if (error.name === 'SQLiteError' || error.name === 'LibsqlError') {
				console.error('Database error:', error.message);
				return createInternalServerError(c, error, 'database operation');
			}

			if (error.message.includes('fetch')) {
				console.error('Network error:', error.message);
				return createInternalServerError(c, error, 'external API call');
			}
		}

		return createInternalServerError(c, error);
	}
};

export const notFoundHandler = (c: Context) =>
	c.json(
		{
			error: 'Endpoint not found',
			code: 'NOT_FOUND',
			details: {
				path: c.req.path,
				method: c.req.method,
			},
		},
		404,
	);
