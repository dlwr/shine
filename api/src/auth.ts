import type {Context} from 'hono';
import {SignJWT, jwtVerify} from 'jose';
import type {Environment} from 'db';
import {
	createAuthenticationError,
	createInternalServerError,
} from './utils/error-handlers';

const JWT_ALGORITHM = 'HS256';

export async function createJWT(secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const secretKey = encoder.encode(secret);

	const jwt = await new SignJWT({role: 'admin'})
		.setProtectedHeader({alg: JWT_ALGORITHM})
		.setIssuedAt()
		.sign(secretKey);

	return jwt;
}

export async function verifyJWT(
	token: string,
	secret: string,
): Promise<boolean> {
	try {
		const encoder = new TextEncoder();
		const secretKey = encoder.encode(secret);

		await jwtVerify(token, secretKey);
		return true;
	} catch {
		return false;
	}
}

export async function authMiddleware(
	c: Context<{Bindings: Environment}>,
	next: () => Promise<void>,
) {
	try {
		const authHeader = c.req.header('Authorization');

		if (!authHeader?.startsWith('Bearer ')) {
			return createAuthenticationError(c, 'MISSING_TOKEN');
		}

		if (!c.env.JWT_SECRET) {
			return createInternalServerError(
				c,
				new Error('JWT_SECRET not configured'),
				'authentication middleware',
			);
		}

		const token = authHeader.slice(7);
		const isValid = await verifyJWT(token, c.env.JWT_SECRET);

		if (!isValid) {
			return createAuthenticationError(c, 'INVALID_TOKEN');
		}

		await next();
	} catch (error) {
		return createInternalServerError(c, error, 'authentication middleware');
	}
}
