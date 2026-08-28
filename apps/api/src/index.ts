import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {globalErrorHandler, notFoundHandler} from './middleware/error-handler';
import {securityHeaders} from './middleware/security';
import {adminRoutes} from './routes/admin';
import {authRoutes} from './routes/auth';
import {awardsRoutes} from './routes/awards';
import {peopleRoutes} from './routes/people';
import {searchRoutes} from './routes/search';
import {crossingsRoutes} from './routes/crossings';
import {documentationRoutes} from './routes/documentation';
import {moviesRoutes} from './routes/movies';
import {quizRoutes} from './routes/quiz';
import {selectionsRoutes} from './routes/selections';
import {uncrownedRoutes} from './routes/uncrowned';
import {utilitiesRoutes} from './routes/utilities';
import {yearsRoutes} from './routes/years';

const app = new Hono<{Bindings: Environment}>();

app.use(
  '*',
  cors({
    origin(origin) {
      // Allow all localhost origins in development
      if (origin?.startsWith('http://localhost:')) {
        return origin;
      }

      // Production origins
      const allowedOrigins = [
        'https://shine-film.com',
        'https://dlwr.github.io',
        'https://shine-front-production.yuta25.workers.dev',
        'https://shine-front.yuta25.workers.dev',
      ];
      return allowedOrigins.includes(origin || '') ? origin : undefined;
    },
    credentials: true,
  }),
);

// Apply security headers to all routes except documentation
app.use('*', async (c, next) =>
  c.req.path.startsWith('/docs') ? next() : securityHeaders(c, next),
);
app.use('*', globalErrorHandler);

// Mount route modules
app.route('/auth', authRoutes);
app.route('/docs', documentationRoutes); // API documentation
app.route('/', selectionsRoutes); // Main endpoint for movie selections
app.route('/movies', moviesRoutes);
app.route('/awards', awardsRoutes);
app.route('/people', peopleRoutes);
app.route('/search', searchRoutes);
app.route('/crossings', crossingsRoutes);
app.route('/uncrowned', uncrownedRoutes);
app.route('/years', yearsRoutes);
app.route('/quiz', quizRoutes);
app.route('/admin', adminRoutes);
app.route('/', utilitiesRoutes); // Utility endpoints like fetch-url-title

app.notFound(notFoundHandler);

export default app;
