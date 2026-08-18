import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {validateExternalUrl} from '../utils/url-safety';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const utilitiesRoutes = new Hono<{Bindings: Environment}>();

// Get URL title
utilitiesRoutes.post('/fetch-url-title', async c => {
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

    const html = await response.text();

    // Extract title from HTML
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    const title = titleMatch ? titleMatch[1].trim() : '';

    if (!title) {
      return c.json({error: 'Could not extract title from URL'}, 400);
    }

    return c.json({title});
  } catch (error) {
    console.error('Error fetching URL title:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
