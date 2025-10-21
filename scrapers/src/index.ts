import type {Environment} from '../../src';
import academyAwardsHandler from './academy-awards';
import japaneseTranslationsHandler from './japanese-translations';
import moviePostersHandler from './movie-posters';

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    if (path.startsWith('/movie-posters')) {
      return moviePostersHandler.fetch(request, environment);
    }

    if (path.startsWith('/academy-awards')) {
      return academyAwardsHandler.fetch(request, environment);
    }

    if (path.startsWith('/japanese-translations')) {
      return japaneseTranslationsHandler.fetch(request, environment);
    }

    if (path === '/' || path === '') {
      return new Response(
        `
        Available routes:
        - /movie-posters - Scrape and store movie poster URLs
        - /academy-awards - Scrape Academy Awards data
        - /academy-awards/seed - Seed Academy Awards master data
        - /japanese-translations - Scrape Japanese translations for movies
      `,
        {
          status: 200,
          headers: {'Content-Type': 'text/plain'},
        },
      );
    }

    return new Response('Not Found', {status: 404});
  },
};
