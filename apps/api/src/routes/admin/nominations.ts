import {and, eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';

export const adminNominationsRoutes = new Hono<{Bindings: Environment}>();

// Add nomination
adminNominationsRoutes.post(
  '/movies/:movieId/nominations',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const movieId = c.req.param('movieId');
      if (!movieId) {
        return c.json({error: 'Missing movieId parameter'}, 400);
      }

      const {
        ceremonyUid,
        categoryUid,
        isWinner = false,
        specialMention,
      } = await c.req.json();

      // Validate required fields
      if (!ceremonyUid || !categoryUid) {
        return c.json({error: 'Ceremony and category are required'}, 400);
      }

      // Check if movie exists
      const movieExists = await database
        .select({uid: movies.uid})
        .from(movies)
        .where(eq(movies.uid, movieId))
        .limit(1);

      if (movieExists.length === 0) {
        return c.json({error: 'Movie not found'}, 404);
      }

      // Check if ceremony exists
      const ceremonyExists = await database
        .select({uid: awardCeremonies.uid})
        .from(awardCeremonies)
        .where(eq(awardCeremonies.uid, ceremonyUid))
        .limit(1);

      if (ceremonyExists.length === 0) {
        return c.json({error: 'Ceremony not found'}, 404);
      }

      // Check if category exists
      const categoryExists = await database
        .select({uid: awardCategories.uid})
        .from(awardCategories)
        .where(eq(awardCategories.uid, categoryUid))
        .limit(1);

      if (categoryExists.length === 0) {
        return c.json({error: 'Category not found'}, 404);
      }

      // Check if nomination already exists
      const existingNomination = await database
        .select({uid: nominations.uid})
        .from(nominations)
        .where(
          and(
            eq(nominations.movieUid, movieId),
            eq(nominations.ceremonyUid, ceremonyUid),
            eq(nominations.categoryUid, categoryUid),
          ),
        )
        .limit(1);

      if (existingNomination.length > 0) {
        return c.json(
          {
            error:
              'Nomination already exists for this movie, ceremony, and category',
          },
          409,
        );
      }

      // Add nomination
      const newNomination = await database
        .insert(nominations)
        .values({
          movieUid: movieId,
          ceremonyUid,
          categoryUid,
          isWinner: isWinner ? 1 : 0,
          specialMention: specialMention || undefined,
        })
        .returning();

      return c.json(newNomination[0]);
    } catch (error) {
      console.error('Error adding nomination:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Update nomination
adminNominationsRoutes.put(
  '/nominations/:nominationId',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const nominationId = c.req.param('nominationId');
      if (!nominationId) {
        return c.json({error: 'Missing nominationId parameter'}, 400);
      }

      const {isWinner, specialMention} = await c.req.json();

      // Check if nomination exists
      const nomination = await database
        .select({uid: nominations.uid})
        .from(nominations)
        .where(eq(nominations.uid, nominationId))
        .limit(1);

      if (nomination.length === 0) {
        return c.json({error: 'Nomination not found'}, 404);
      }

      // Update nomination
      await database
        .update(nominations)
        .set({
          isWinner: isWinner ? 1 : 0,
          specialMention: specialMention || undefined,
        })
        .where(eq(nominations.uid, nominationId));

      return c.json({success: true});
    } catch (error) {
      console.error('Error updating nomination:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Delete nomination
adminNominationsRoutes.delete(
  '/nominations/:nominationId',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const nominationId = c.req.param('nominationId');
      if (!nominationId) {
        return c.json({error: 'Missing nominationId parameter'}, 400);
      }

      // Check if nomination exists
      const nomination = await database
        .select({uid: nominations.uid})
        .from(nominations)
        .where(eq(nominations.uid, nominationId))
        .limit(1);

      if (nomination.length === 0) {
        return c.json({error: 'Nomination not found'}, 404);
      }

      // Delete nomination
      await database
        .delete(nominations)
        .where(eq(nominations.uid, nominationId));

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting nomination:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);
