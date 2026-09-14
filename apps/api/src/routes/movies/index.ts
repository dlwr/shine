import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {movieArticleLinksRoutes} from './article-links';
import {movieAvailabilityRoutes} from './availability';
import {movieDetailRoutes} from './detail';
import {movieSearchRoutes} from './search';
import {movieTranslationsRoutes} from './translations';

export const moviesRoutes = new Hono<{Bindings: Environment}>();

moviesRoutes.route('/', movieSearchRoutes);
moviesRoutes.route('/', movieDetailRoutes);
moviesRoutes.route('/', movieTranslationsRoutes);
moviesRoutes.route('/', movieArticleLinksRoutes);
moviesRoutes.route('/', movieAvailabilityRoutes);
