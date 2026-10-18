import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {resolveClientIp} from '../utils/client-ip';
import {decodeHtmlText} from '../utils/html-text';
import {createInMemoryRateLimit} from '../utils/request-rate-limit';
import {validateExternalUrl} from '../utils/url-safety';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_HTML_BYTES = 256 * 1024;
const MARKUP_CONTENT_TYPE = /^(?:text\/|application\/(?:xhtml\+xml|xml))/i;

const isTitleRateLimited = createInMemoryRateLimit({
  limit: 60,
  windowMs: 60 * 60 * 1000,
});

async function cancelQuietly(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    return;
  }
}

async function readMarkup(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type');
  if (contentType && !MARKUP_CONTENT_TYPE.test(contentType)) {
    return '';
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let markup = '';
  let bytes = 0;

  try {
    while (bytes < MAX_HTML_BYTES) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }

      bytes += value.byteLength;
      markup += decoder.decode(value, {stream: true});
      if (/<\/title>/i.test(markup)) {
        break;
      }
    }
  } finally {
    await cancelQuietly(reader);
  }

  return markup;
}

export const utilitiesRoutes = new Hono<{Bindings: Environment}>();

// Get URL title
utilitiesRoutes.post('/fetch-url-title', async c => {
  const ip = resolveClientIp(c);
  const attempt = await c.env.TITLE_RATE_LIMITER?.limit({key: ip});
  if (attempt?.success === false || isTitleRateLimited(ip)) {
    return c.json(
      {error: 'Rate limit exceeded. Please try again later.'},
      429,
      {
        'Retry-After': '60',
      },
    );
  }

  try {
    const {url} = await c.req.json();

    if (!url) {
      return c.json({error: 'URL is required'}, 400);
    }

    const validation = validateExternalUrl(String(url));
    if (!validation.ok) {
      return c.json({error: validation.reason}, 400);
    }

    let currentUrl = validation.url;
    let response: Response | undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        break;
      }

      const location = response.headers.get('location');
      if (!location) {
        break;
      }

      const nextValidation = validateExternalUrl(
        new URL(location, currentUrl).href,
      );
      if (!nextValidation.ok) {
        return c.json({error: 'Failed to fetch URL'}, 400);
      }

      currentUrl = nextValidation.url;
    }

    if (!response?.ok) {
      return c.json({error: 'Failed to fetch URL'}, 400);
    }

    const html = await readMarkup(response);

    // Extract title from HTML
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    const title = titleMatch ? decodeHtmlText(titleMatch[1]) : '';

    if (!title) {
      return c.json({error: 'Could not extract title from URL'}, 400);
    }

    return c.json({title});
  } catch (error) {
    console.error('Error fetching URL title:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
