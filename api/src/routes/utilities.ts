import type {Environment} from 'db';
import {Hono} from 'hono';

export const utilitiesRoutes = new Hono<{Bindings: Environment}>();

// Get URL title
utilitiesRoutes.post('/fetch-url-title', async c => {
  try {
    const {url} = await c.req.json();

    // Validate URL
    if (!url) {
      return c.json({error: 'URL is required'}, 400);
    }

    try {
      new URL(url);
    } catch {
      return c.json({error: 'Invalid URL format'}, 400);
    }

    // Fetch URL content
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
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
