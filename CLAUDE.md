# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHINE is a comprehensive movie database project designed to be the world's most organized movie database. It collects and organizes movie information, awards, nominations, and multilingual translations. The project is built on Cloudflare Workers with Turso (libSQL) database and uses a modular architecture with separate packages for API, scrapers, database, and frontend.

## Architecture

The project uses a simplified monorepo structure with pnpm workspaces:

- **api/** - Hono-based REST API running on Cloudflare Workers
- **scrapers/** - CLI-based data collection tools (Wikipedia, TMDb, Cannes Film Festival, Academy Awards)
- **front-rr/** - React Router v7-based frontend (Cloudflare Workers)
- **src/** - Shared database schemas, migrations, and utilities

Key design patterns:

- Date-seeded movie selection (daily/weekly/monthly) with deterministic hash-based randomization, persisted in database
- Multilingual support through a flexible translations table
- Comprehensive awards and nominations tracking system
- UUID-based primary keys with snake_case database naming
- Database: Turso (libSQL) - a SQLite-compatible edge database

## Common Commands

### Development

```bash
# Start both API and React Router v7 frontend development servers
pnpm run dev

# Start API development server with local DB persistence
pnpm run api:dev

# Start React Router v7 frontend development server
pnpm run front-rr:dev

# Run scrapers (CLI tools)
pnpm run scrapers:academy-awards
pnpm run scrapers:cannes-film-festival [year]  # Optional year parameter
pnpm run scrapers:japanese-translations
pnpm run scrapers:movie-posters
pnpm run scrapers:movie-import
```

### Database Operations

```bash
# Development database commands
pnpm run db:studio
pnpm run db:generate
pnpm run db:migrate
pnpm run db:push

# Production database commands
pnpm run db:studio:prod
pnpm run db:generate:prod
pnpm run db:migrate:prod
pnpm run db:push:prod
```

### Deployment

```bash
# Deploy API to development environment
pnpm run api:deploy:dev

# Deploy API to production environment
pnpm run api:deploy:prod

# Deploy React Router v7 frontend to development environment
pnpm run front:deploy:dev

# Deploy React Router v7 frontend to production environment
pnpm run front:deploy:prod

# Note: Scrapers run locally as CLI tools and are not deployed
```

### API Documentation

```bash
# Validate OpenAPI specification
pnpm run docs:validate

# Build static documentation
pnpm run docs:build

# Preview documentation locally
pnpm run docs:serve

# Bundle OpenAPI spec to JSON
pnpm run docs:bundle

# Access interactive documentation (when API is running)
# Swagger UI: http://localhost:8787/docs
# ReDoc: http://localhost:8787/docs/redoc
# OpenAPI spec: http://localhost:8787/docs/openapi.yml
```

### Utilities

```bash
# Lint code
npx eslint .

# Format code
npx prettier --write .

# Run React Router v7 frontend tests
pnpm run test:front-rr
```

## React Router v7 Frontend

SHINE project uses a modern React Router v7-based frontend built with Test-Driven Development (TDD). This implementation runs on Cloudflare Workers and provides server-side rendering (SSR) with full TypeScript support.

### Architecture

- **Framework**: React Router v7 with TypeScript
- **Runtime**: Cloudflare Workers with SSR
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest with React Testing Library
- **Type Safety**: Full TypeScript coverage with Cloudflare Workers types

### TDD Implementation Features

All features have been implemented using Test-Driven Development with comprehensive test coverage:

**Pages & Routes:**

- **Home Page (`/`)**: Date-seeded movie selections (daily/weekly/monthly)
- **Movie Details (`/movies/:id`)**: Individual movie information and nominations
- **Search (`/search`)**: Movie search functionality with filters
- **Admin Login (`/admin/login`)**: JWT-based authentication
- **Admin Movies (`/admin/movies`)**: Movie management interface

**Core Features:**

- Responsive design with mobile-first approach
- JWT authentication with localStorage persistence
- Error handling and loading states
- Accessibility-compliant components
- SEO-optimized meta tags

### Test Coverage

Complete test suite with **51 tests passing** across all components:

```bash
✓ front-rr/app/routes/admin.movies.test.tsx (12 tests)
✓ front-rr/app/routes/movies.$id.test.tsx (10 tests)
✓ front-rr/app/routes/home.test.tsx (8 tests)
✓ front-rr/app/routes/admin.login.test.tsx (10 tests)
✓ front-rr/app/routes/search.test.tsx (11 tests)
```

**Test Categories:**

- Loader functions (API data fetching)
- Component rendering and interactions
- Error state handling
- Form submissions and validation
- Authentication flows
- Meta tag generation

### Authentication System

- **Method**: JWT tokens stored in localStorage
- **Admin Login**: Password-based authentication with the API
- **Route Protection**: Client-side auth checks for admin routes
- **Session Management**: Automatic token validation and renewal

### API Integration

Seamlessly integrates with the Hono-based API:

- Environment-aware API URL configuration
- Comprehensive error handling for network failures
- Type-safe API response interfaces
- Optimistic UI updates for better user experience

### Development Workflow

```bash
# Start development server
pnpm run front-rr:dev

# Run tests
pnpm run test:front-rr

# Build for production
pnpm run front-rr:build

# Deploy to development
pnpm run front-rr:deploy:dev

# Deploy to production
pnpm run front-rr:deploy:prod
```

### Key Files

- `front-rr/app/routes/` - Page components with loaders and tests
- `front-rr/app/root.tsx` - Root application component
- `front-rr/workers/app.ts` - Cloudflare Workers entry point
- `front-rr/react-router.config.ts` - React Router configuration
- `front-rr/wrangler.jsonc` - Cloudflare Workers deployment configuration

## Database Schema

The core entities follow this relationship structure:

```
movies ←→ translations (movie titles/descriptions)
  ↓ 1:N     ↓ 1:N
nominations  movie_selections (daily/weekly/monthly picks)
  ↓ N:1         ↓ 1:N
award_categories  poster_urls
  ↓ N:1
award_organizations
  ↓ 1:N
award_ceremonies
```

Important schema details:

- All tables use UUID primary keys generated by `generateUUID()` utility
- **`translations` table structure**:
  - `resourceType` must be `"movie_title"` for movie titles (NOT `"movie"`)
  - `content` field contains the raw title text directly (NOT formatted like `"title:Movie Name"`)
  - Composite unique constraint on `(resourceType, resourceUid, languageCode)`
  - Movie titles are NOT stored in the movies table itself - they must be in translations
- Database uses snake_case naming convention (configured in drizzle.config.ts)
- Date-seeded movie selection uses deterministic hash-based algorithms with persistence in `movie_selections` table

## Database Configuration

The project uses Turso (libSQL) as the database with separate databases for development and production. Configuration requires:

**Development Environment:**

- `TURSO_DATABASE_URL`: Your development Turso database URL
- `TURSO_AUTH_TOKEN`: Your development Turso authentication token

**Production Environment:**

- `TURSO_DATABASE_URL_PROD`: Your production Turso database URL
- `TURSO_AUTH_TOKEN_PROD`: Your production Turso authentication token

**Admin Authentication:**

- `ADMIN_PASSWORD`: Admin password for login
- `JWT_SECRET`: Secret key for JWT token generation (uses `jose` library)

**External APIs (for scrapers):**

- `TMDB_API_KEY`: TMDb API key for movie data
- `TMDB_LEAD_ACCESS_TOKEN`: TMDb access token
- `OMDB_API_KEY`: OMDb API key for additional movie data

For local development with Cloudflare Workers:

1. Copy `.dev.vars.example` to `.dev.vars` in the root directory
2. Add your Turso credentials and API keys
3. The `.dev.vars` file is automatically symlinked to `api/` and `scrapers/` directories
4. Environment variables are loaded automatically by wrangler during development

For production deployment, set secrets using:

```bash
wrangler secret put TURSO_AUTH_TOKEN_PROD --env production
wrangler secret put ADMIN_PASSWORD --env production
wrangler secret put JWT_SECRET --env production
```

## Data Collection Strategy

Scrapers are CLI-based tools that run locally and follow this priority order:

1. Wikipedia (primary source for basic info and awards)
2. TMDb (The Movie Database - for Japanese translations and poster URLs)
3. Cannes Film Festival (official selections and awards)
4. Academy Awards (Oscar nominations and wins)
5. OMDb (planned for additional movie data)

Scraping features:

- Cheerio for HTML parsing with error handling and retry logic
- Command-line arguments support (e.g., specific year for Cannes scraper)
- Incremental updates to avoid duplicate data
- Integration with TMDb API for enriched movie data
- Automatic poster URL and translation fetching

## API Design

The main API endpoint (`/`) returns date-seeded movie selections:

- Daily: Changes every day
- Weekly: Changes every Friday (week starts Friday)
- Monthly: Changes every month

Movie selection features:

- Hash-based seeding ensures deterministic but varied results
- Selections are persisted in the `movie_selections` table
- Existing selections are reused to maintain consistency
- Fallback to hash-based selection if no movies match criteria

### Public API Endpoints

- `GET /` - Get date-seeded movie selections (daily/weekly/monthly)
- `GET /movies/:id` - Get movie details with all translations

### Admin API Endpoints

Authentication is handled via JWT tokens (using `jose` library) stored in localStorage (client-side only):

- `POST /auth/login` - Login with admin password
- `GET /admin/movies` - List all movies (paginated)
- `POST /movies/:id/translations` - Add or update movie translation
- `DELETE /movies/:id/translations/:lang` - Delete movie translation
- `DELETE /admin/movies/:id` - Delete movie and all related data (nominations, translations, posters, selections)
- `PUT /admin/movies/:id/imdb-id` - Update IMDb ID with optional TMDb data refresh
- `POST /admin/movies/:id/posters` - Add poster URL to movie
- `DELETE /admin/movies/:movieId/posters/:posterId` - Delete poster from movie
- `POST /reselect` - Force new movie selection for a specific period

### Admin Frontend Routes

Admin interface pages (authentication required via localStorage token):

- `/admin/login` - Admin login page
- `/admin/movies` - Movies list with pagination
- `/admin/movies/:id` - Edit movie details and translations

Note: Authentication uses localStorage, not cookies, ensuring client-side auth management.

## Code Style and Conventions

- TypeScript with strict configuration
- ESLint with recommended + strict + unicorn rules
- Prettier for formatting with import organization
- No comments in code unless explicitly requested
- Follow existing patterns for database queries and API responses
- Use existing utilities and libraries (Hono, Drizzle, Cheerio)

## Important Files

- `src/schema/index.ts` - Database schema definitions
- `api/src/index.ts` - Main API implementation with date-seeding logic
- `drizzle.config.ts` - Database configuration for Turso
- `.dev.vars.example` - Environment variable template
- `.dev.vars` - Local development variables (symlinked to `api/` and `scrapers/`)
- `src/schema/movie-selections.ts` - Movie selection persistence schema
- `scrapers/src/japanese-translations/` - TMDb integration for translations
- `scrapers/src/cannes-film-festival.ts` - Cannes scraper with year parameter support

## Recent Changes Log

Track recent changes and updates to keep CLAUDE.md synchronized with the codebase.

### 2025-01-10

- Updated CLAUDE.md to reflect current project state
- Added movie_selections table documentation
- Updated scraper commands (TMDb, Cannes Film Festival integration)
- Fixed environment variable names (removed \_DEV suffix)
- Added missing API endpoints documentation
- Updated file paths to match current structure
- Added `pnpm run dev` command to start both API and frontend concurrently

### 2025-06-10

- Improved `/admin/movies` page with better sorting and poster display:
  - Changed default sort order to `created_at DESC` (newest movies first)
  - Modified poster display to show only one poster per movie instead of multiple
- Added movie deletion functionality:
  - New `DELETE /admin/movies/:id` API endpoint with cascading delete of all related data
  - Added delete button with confirmation dialog in admin movies list
  - Proper cleanup of movie_selections, nominations, translations, and poster_urls
- Fixed `/admin/movies` API endpoint bug:
  - Corrected SQL ORDER BY clause to use proper camelCase column name `createdAt` instead of snake_case `created_at`
  - Used SQL template with schema field reference: `sql`${movies.createdAt} DESC`` at api/src/index.ts:581

### 2025-06-10 (Updated)

- Fixed API URL handling inconsistency:
  - Standardized all API URL construction to NOT include trailing slash in base URL
  - All API paths must start with leading slash (e.g., `/auth/login`, `/reselect`)
  - Fixed API URL construction in frontend and `wrangler.jsonc` to follow this pattern
  - This prevents URL construction errors like `http://localhost:8787reselect`
- Fixed `/reselect` endpoint:
  - The endpoint expects `type` parameter, not `period`
  - Request body should include both `type` and `locale`
- Fixed movie import script (`movie-import-from-list.ts`):
  - Corrected `resourceType` to use `"movie_title"` instead of `"movie"`
  - Fixed `content` field to store raw title text instead of formatted strings
  - Resolved all ESLint errors (non-null assertions, null vs undefined, unused variables)

### 2025-06-11

- Fixed Cloudflare deployment environment variable issues:
  - Environment variables in Cloudflare Workers must be set in `wrangler.jsonc` under `vars` section, not as secrets
  - React Router v7 components access environment variables via loader context
  - Secrets and vars cannot coexist with the same name - delete secrets if using vars
- Fixed movie import nomination assignment bug:
  - Movie import scripts were incorrectly assigning all nominations to Cannes Film Festival
  - Root cause: Database lookups for categories and ceremonies didn't filter by `organizationUid`
  - Fixed `scrapers/src/movie-import-from-list.ts` and `scrapers/src/academy-awards.ts` to use compound WHERE clauses
  - Now properly filters by both identifying field AND `organizationUid` using `and()` condition
  - This ensures nominations are assigned to the correct award organization

### 2025-06-11 (Article Links Feature)

- Added article links feature for user-submitted movie-related articles:
  - New `article_links` table with spam/flagging support and rate limiting
  - Public submission API with IP-based rate limiting (10 submissions per hour per IP)
  - Article links displayed in MovieCard components (top 3 by submission date)
  - Dedicated movie detail pages (`/movies/[id]`) for article submission
  - Admin spam flagging functionality via `POST /admin/article-links/:id/spam`
- Implemented mobile-responsive collapsible content:
  - Nominations, article links, and add article button are collapsible on mobile (≤768px)
  - Always expanded on desktop (>768px)
  - Smooth animations with toggle button and icons
- **Removed view counting feature completely**:
  - Removed `viewCount` column from `article_links` table
  - Removed `/article-links/:id/view` API endpoint
  - Articles now sorted by `submittedAt DESC` instead of view count
  - Cleaner UI without view count displays

### 2025-06-11 (Dependabot Setup)

- Added Dependabot configuration (`.github/dependabot.yml`) for automated dependency updates:
  - Monitors all workspace packages: root, api, scrapers, front-rr
  - Weekly updates on Monday 9:00 AM
  - Scoped commit message prefixes: `deps(api)`, `deps(scrapers)`, `deps(front-rr)`, `deps`
  - Rate-limited PRs: 5 per package, 3 for GitHub Actions
  - Includes GitHub Actions monitoring for CI/CD workflow updates

### 2025-06-11 (Cannes Winner Update Enhancement)

- Added `--winners-only` option to Cannes Film Festival scraper for lightweight winner status updates:
  - **Lightweight mode**: Skips TMDb API calls, poster downloads, and new movie creation
  - **Winner detection improvement**: Enhanced `findPalmeDOrWinner` function with better Wikipedia parsing
  - **CLI support**: Added `--winners-only` flag to `cannes-film-festival-cli.ts`
  - **Database efficiency**: Only updates `isWinner` flag in existing nominations
- **Usage**:
  - `pnpm run scrapers:cannes-film-festival --winners-only` (all years)
  - `pnpm run scrapers:cannes-film-festival --year 2024 --winners-only` (specific year)
- **Key Files**:
  - `scrapers/src/cannes-film-festival.ts`: Added `updateAllCannesWinnersOnly()` and `updateCannesWinnersOnly(year)` functions
  - `scrapers/src/cannes-film-festival-cli.ts`: Added CLI argument parsing for `--winners-only` flag

### 2025-06-13 (Admin Movie Management Enhancement)

- **IMDb ID Manual Update with TMDb Integration**:
  - Added `PUT /admin/movies/:id/imdb-id` API endpoint with optional TMDb data refresh
  - Includes TMDb ID auto-detection, poster fetching, and Japanese translation retrieval
  - Frontend modal with checkbox for "TMDbから追加データを取得" option
  - Comprehensive validation: IMDb ID format, duplicate prevention, API error handling
  - Fixed missing `tmdbId` field in movie details API response (`/movies/:id`)
- **Poster Management System**:
  - Added `POST /admin/movies/:id/posters` and `DELETE /admin/movies/:movieId/posters/:posterId` endpoints
  - Complete poster CRUD operations with primary poster designation
  - Frontend grid-based poster display with thumbnails, metadata, and delete functionality
  - Support for manual poster addition with URL, dimensions, language, and source tracking
  - Enhanced movie details API to include complete poster information array
- **Key Features**:
  - Manual IMDb ID updates trigger optional TMDb data synchronization
  - Poster management with visual grid interface and primary designation
  - Comprehensive form validation and error handling across all new features
  - Real-time UI updates after all operations

### 2025-06-11 (Japan Academy Awards Scraper Implementation)

- Successfully implemented Japan Academy Awards scraper from consolidated Wikipedia page:
  - **Source**: Uses `https://ja.wikipedia.org/wiki/日本アカデミー賞作品賞` (consolidated awards page)
  - **Coverage**: Extracts 159 movies across years 1978-2024 (missing: 1979, 1989, 1999, 2009, 2019)
  - **Year detection**: Multi-pattern approach (`YYYY年（第X回）`, `第X回`, `YYYY年`) with ceremony calculation `1976 + X = year`
  - **Duplicate prevention**: Implemented `processedYears` Set to avoid processing same year multiple times
  - **2024 special handling**: Extracts movies from text format rather than table (5 nominees: 侍タイムスリッパー, キングダム 大将軍の帰還, 正体, 夜明けのすべて, ラストマイル)
- **CLI Integration**: Full support for `--year`, `--dry-run`, `--seed` options
- **Code Quality**: ESLint compliant, proper TypeScript types, clean production-ready code
- **Key Files**:
  - `scrapers/src/japan-academy-awards.ts`: Main scraper implementation
  - `scrapers/src/japan-academy-awards-cli.ts`: CLI interface
  - `src/seeds/japan-academy-awards.ts`: Database seeding
- **Usage**:
  - `pnpm run scrapers:japan-academy-awards` (all years)
  - `pnpm run scrapers:japan-academy-awards --year 2024` (specific year)
  - `pnpm run scrapers:japan-academy-awards --dry-run` (safe testing)

### 2025-06-11 (Movie Deletion Foreign Key Fix)

- Fixed critical foreign key constraint error in movie deletion API:
  - **Root cause**: `reference_urls` table deletion was missing from cascading delete logic
  - **Solution**: Added `referenceUrls` deletion to movie delete endpoint at `api/src/index.ts:665-668`
  - **Complete deletion order**: article_links → movie_selections → nominations → reference_urls → translations → poster_urls → movies
  - **Prevention**: Added comprehensive guidelines for foreign key constraint handling in Development Guidelines
- **Lesson learned**: Always verify ALL foreign key references across entire schema when implementing delete operations
- **Key insight**: Most tables lack `onDelete: 'cascade'` configuration, requiring manual cascading delete implementation

### 2025-06-27 (React Router v7 Frontend Implementation)

- Successfully implemented React Router v7-based frontend using Test-Driven Development (TDD):
  - **Complete TDD Implementation**: All 51 tests passing across 5 test files
  - **Modern Architecture**: React Router v7 with Cloudflare Workers SSR and Tailwind CSS v4
  - **Pages Implemented**: Home (`/`), Movie Details (`/movies/:id`), Search (`/search`), Admin Login (`/admin/login`), Admin Movies (`/admin/movies`)
  - **Authentication**: JWT-based localStorage authentication matching API design
  - **Comprehensive Testing**: Loader functions, component rendering, error handling, form validation, and authentication flows
- **Added to CLAUDE.md**: Complete React Router v7 Frontend section with architecture, features, test coverage, and deployment commands
- **Updated Commands**: Added front-rr deployment and testing commands to relevant sections
- **Production-ready**: Full-featured frontend with comprehensive test coverage and modern architecture

### 2025-07-01 (Complete Migration to React Router v7)

- Completed full migration from Astro to React Router v7:
  - **Removed Legacy Frontend**: Deleted entire `front/` directory containing Astro-based implementation
  - **Updated Build Scripts**: Renamed `front-rr` commands to `front` throughout package.json
  - **Simplified Architecture**: React Router v7 is now the sole frontend implementation
  - **Updated Documentation**: Removed all references to legacy Astro frontend and dual-frontend setup
- **Migration Details**:
  - All functionality from Astro frontend has been reimplemented in React Router v7
  - Maintained feature parity including movie selections, admin interface, and article links
  - Improved performance with Cloudflare Workers SSR instead of static site generation
- **Benefits**:
  - Unified frontend codebase with consistent patterns
  - Better type safety with full TypeScript coverage
  - Comprehensive test coverage (51+ tests)
  - Modern development experience with React Router v7

### Development Guidelines

- TSエラーとLintエラーをを絶対に無視するな
- Database column names in schema use camelCase (e.g., `createdAt`, `updatedAt`) but are mapped to snake_case in the actual database
- When writing SQL queries, use the schema field references directly instead of hardcoding column names
- **API URL Convention**: Base URLs should NOT have trailing slashes, paths should start with leading slash
- **Cloudflare Workers Environment Variables**: Use `vars` in wrangler.jsonc, access via loader context in React Router v7 components
- **API URL Handling**: Environment-aware API URL configuration in React Router v7 loaders
- **Mobile Responsiveness**: Consider mobile-first design with collapsible content for dense information
- **Security**: Always implement rate limiting for public submission endpoints
- **TailwindCSS**: Use utility-first approach, preserve custom CSS only for complex animations/interactions
- **Component Styling**: Follow responsive patterns like `text-xl md:text-2xl` and `p-5 md:p-6`
- **Favicon Management**: Use ImageMagick to generate multiple favicon formats from source assets; maintain 16x16, 32x32, ICO, and Apple touch icon variants
- **Database Foreign Key Constraints and Cascading Deletes**:
  - **Critical**: When implementing delete operations for core entities (movies, awards, etc.), always verify ALL foreign key references across the entire schema
  - Most tables do NOT have `onDelete: 'cascade'` configured, requiring manual deletion of related data
  - **Movie deletion order**: article_links → movie_selections → nominations → reference_urls → translations → poster_urls → movies
  - Use `Task` tool to search all schema files for foreign key references when implementing new delete operations
  - Test delete operations in development to catch missing cascading delete logic before production
- **Wikipedia Scraping Best Practices**:
  - Use duplicate prevention logic (`Set<T>`) when processing tables to avoid year/data duplication
  - Implement multiple year detection patterns for robustness (`YYYY年（第X回）`, `第X回`, `YYYY年`)
  - Handle special cases where data appears in text format rather than tables (e.g., 2024 Japan Academy Awards)
  - Always include comprehensive error handling and skip logic for malformed/irrelevant tables
  - Remove debug output before production; keep only essential operational logs
- **Admin Interface Development**:
  - Always include proper TypeScript types for API responses to avoid runtime errors
  - Use modal-based UI patterns for complex form interactions (IMDb ID, poster management)
  - Implement comprehensive form validation both client and server-side
  - Provide immediate user feedback for all operations (success/error messages)
  - Use grid layouts for visual content management (poster thumbnails)
  - Implement confirmation dialogs for destructive operations (delete)
- **TMDb API Integration Best Practices**:
  - Always use existing TMDb utility functions from `scrapers/src/common/tmdb-utilities.ts`
  - Implement graceful fallbacks when TMDb data is unavailable
  - Log essential operations but remove debug output for production
  - Use consistent error handling patterns across TMDb API calls
