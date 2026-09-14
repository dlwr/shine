import {
  and,
  eq,
  getDatabase,
  gt,
  isNull,
  sql,
  type Environment,
} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {Hono} from 'hono';
import {hasValidAdminToken} from '../../auth';
import {sanitizeText, sanitizeUrl} from '../../middleware/sanitizer';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';
import {
  notifyArticleLinkSubmission,
  type ArticleLinkSubmission,
} from '../../utils/article-link-notification';
import {resolveClientIp} from '../../utils/client-ip';
import {verifyTurnstileToken} from '../../utils/turnstile';

export const movieArticleLinksRoutes = new Hono<{Bindings: Environment}>();

async function notifyWithMovieTitle(
  environment: Environment,
  database: ReturnType<typeof getDatabase>,
  submission: ArticleLinkSubmission,
): Promise<void> {
  const [title] = await database
    .select({content: translations.content})
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'movie_title'),
        eq(translations.resourceUid, submission.movieUid),
        eq(translations.languageCode, 'ja'),
      ),
    )
    .limit(1);

  await notifyArticleLinkSubmission(environment, {
    ...submission,
    movieTitle: title?.content,
  });
}

movieArticleLinksRoutes.post('/:id/article-links', async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      url: rawUrl,
      title: rawTitle,
      description: rawDescriptionInput,
      captchaToken: rawCaptchaToken,
    } = await c.req.json();

    const rawDescription =
      typeof rawDescriptionInput === 'string'
        ? rawDescriptionInput.trim()
        : rawDescriptionInput;

    if (!rawUrl && !rawDescription) {
      return c.json({error: 'URL or description is required'}, 400);
    }

    if (rawUrl && !rawTitle) {
      return c.json({error: 'Title is required when URL is given'}, 400);
    }

    if (!rawCaptchaToken) {
      return c.json({error: 'Captcha token is required'}, 400);
    }

    if (rawTitle && rawTitle.length > 200) {
      return c.json({error: 'Title too long'}, 400);
    }

    if (rawDescription && rawDescription.length > 500) {
      return c.json({error: 'Description too long'}, 400);
    }

    const url = rawUrl ? sanitizeUrl(rawUrl) : undefined;
    const title = rawUrl && rawTitle ? sanitizeText(rawTitle) : undefined;
    const description = rawDescription
      ? sanitizeText(rawDescription)
      : undefined;
    const captchaToken =
      typeof rawCaptchaToken === 'string' ? rawCaptchaToken.trim() : '';

    if (!captchaToken) {
      return c.json({error: 'Captcha token is required'}, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    // Get IP address for rate limiting and Turnstile verification
    const ip = resolveClientIp(c);

    const nodeEnvironment =
      typeof process === 'undefined' ? undefined : process.env?.NODE_ENV;
    const isTestEnvironment = nodeEnvironment === 'test';

    if (!isTestEnvironment) {
      try {
        const verification = await verifyTurnstileToken(
          c.env.TURNSTILE_SECRET_KEY,
          captchaToken,
          ip,
        );

        if (!verification.success) {
          console.warn(
            'Turnstile verification failed',
            verification['error-codes'],
          );
          return c.json(
            {error: 'Turnstile verification failed. Please try again.'},
            400,
          );
        }
      } catch (verificationError) {
        console.error('Error verifying Turnstile token:', verificationError);
        return c.json(
          {error: 'Failed to verify submission. Please try again later.'},
          500,
        );
      }
    }

    // Check rate limit (max 10 submissions per IP per hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentSubmissions = await database
      .select({count: sql<number>`count(*)`})
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.submitterIp, ip),
          gt(articleLinks.submittedAt, oneHourAgo),
        ),
      );

    if (recentSubmissions[0].count >= 10) {
      return c.json(
        {error: 'Rate limit exceeded. Please try again later.'},
        429,
      );
    }

    const isOwnerSubmission = await hasValidAdminToken(c);

    // Insert article link
    const newArticle = await database
      .insert(articleLinks)
      .values({
        movieUid: movieId,
        url,
        title: title?.slice(0, 200),
        description: description ? description.slice(0, 500) : undefined,
        submitterIp: ip,
        isOwnerSubmission,
      })
      .returning();

    await invalidateMovieCaches(c.env, movieId);

    if (c.env.DISCORD_WEBHOOK_URL) {
      const task = notifyWithMovieTitle(c.env, database, {
        movieUid: movieId,
        url,
        title,
        description,
        submitterIp: ip,
        isOwnerSubmission,
      });

      try {
        c.executionCtx.waitUntil(task);
      } catch {
        await task;
      }
    }

    return c.json(newArticle[0], 201);
  } catch (error) {
    console.error('Error submitting article link:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Get article links for a movie
movieArticleLinksRoutes.get('/:id/article-links', async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const articles = await database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description,
        submittedAt: articleLinks.submittedAt,
      })
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.movieUid, movieId),
          eq(articleLinks.isSpam, false),
          eq(articleLinks.isFlagged, false),
        ),
      )
      .orderBy(sql`${articleLinks.submittedAt} DESC`)
      .limit(20);

    return c.json(articles);
  } catch (error) {
    console.error('Error fetching article links:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
