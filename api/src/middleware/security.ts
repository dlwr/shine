import type {Context, Next} from 'hono';

export const securityHeaders = async (c: Context, next: Next) => {
	await next();

	c.header('X-Content-Type-Options', 'nosniff');
	c.header('X-Frame-Options', 'DENY');
	c.header('X-XSS-Protection', '1; mode=block');
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	c.header(
		'Content-Security-Policy',
		"default-src 'self'; " +
			"script-src 'self' 'unsafe-inline'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: https:; " +
			"connect-src 'self'; " +
			"font-src 'self'; " +
			"object-src 'none'; " +
			"media-src 'self'; " +
			"form-action 'self';",
	);
	c.header(
		'Strict-Transport-Security',
		'max-age=31536000; includeSubDomains; preload',
	);
	c.header(
		'Permissions-Policy',
		'geolocation=(), ' +
			'microphone=(), ' +
			'camera=(), ' +
			'payment=(), ' +
			'usb=(), ' +
			'magnetometer=(), ' +
			'gyroscope=(), ' +
			'speaker=(), ' +
			'accelerometer=(), ' +
			'clipboard-read=(), ' +
			'clipboard-write=()',
	);
};
