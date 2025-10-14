import DOMPurify from 'dompurify';

export const sanitizeHtml = (input: string): string =>
	DOMPurify.sanitize(input, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
		KEEP_CONTENT: true,
	});

export const sanitizeText = (input: string): string =>
	input
		.replaceAll(/[<>]/g, '')
		.replaceAll(/javascript:/gi, '')
		.replaceAll(/data:/gi, '')
		.replaceAll(/vbscript:/gi, '')
		.trim();

export const sanitizeUrl = (input: string): string => {
	try {
		const url = new URL(input);

		if (!['http:', 'https:'].includes(url.protocol)) {
			throw new Error('Invalid protocol');
		}

		return url.toString();
	} catch {
		throw new Error('Invalid URL');
	}
};
