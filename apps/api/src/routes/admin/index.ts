import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {adminArticleLinksRoutes} from './article-links';
import {adminCeremoniesRoutes} from './ceremonies';
import {adminMovieExternalIdsRoutes} from './movie-external-ids';
import {adminMovieMergeRoutes} from './movie-merge';
import {adminMoviesRoutes} from './movies';
import {adminNominationsRoutes} from './nominations';
import {adminPostersRoutes} from './posters';

export const adminRoutes = new Hono<{Bindings: Environment}>();

adminRoutes.route('/', adminMoviesRoutes);
adminRoutes.route('/', adminMovieExternalIdsRoutes);
adminRoutes.route('/', adminMovieMergeRoutes);
adminRoutes.route('/', adminArticleLinksRoutes);
adminRoutes.route('/', adminPostersRoutes);
adminRoutes.route('/', adminCeremoniesRoutes);
adminRoutes.route('/', adminNominationsRoutes);
