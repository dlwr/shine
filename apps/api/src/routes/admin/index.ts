import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {adminArticleLinksRoutes} from './article-links';
import {adminCeremoniesRoutes} from './ceremonies';
import {adminMoviesRoutes} from './movies';
import {adminNominationsRoutes} from './nominations';
import {adminPostersRoutes} from './posters';

export const adminRoutes = new Hono<{Bindings: Environment}>();

adminRoutes.route('/', adminMoviesRoutes);
adminRoutes.route('/', adminArticleLinksRoutes);
adminRoutes.route('/', adminPostersRoutes);
adminRoutes.route('/', adminCeremoniesRoutes);
adminRoutes.route('/', adminNominationsRoutes);
