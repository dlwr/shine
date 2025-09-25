# Repository Guidelines

## Project Structure & Module Organization
- The repo is a pnpm workspace with `api`, `front`, and `scrapers` packages alongside shared `src/` database logic.
- `src/` hosts Drizzle ORM schema, migrations, and shared utilities; database setup scripts live in `scripts/`.
- Cloudflare Worker code sits in `api/src` with route files under `routes/` and middleware/services folders; tests reside in `api/tests` and `api/src/__tests__`.
- The Remix front end lives in `front/app` (routes named with Remix dot-segments), static assets in `front/public`, and worker builds in `front/build`.
- Scraper CLIs are in `scrapers/src` with per-festival directories and matching `__tests__`; run outputs to `data/` and `tmp/`.

## Build, Test, and Development Commands
- Use `pnpm install` to sync workspaces (Node >=18).
- `pnpm dev` boots API (`wrangler`) and front dev server concurrently; run package-specific dev with `pnpm api:dev` or `pnpm --filter front run dev`.
- Execute `pnpm front:build` for production Remix assets, and `pnpm api:deploy:dev` / `pnpm front:deploy:dev` for Cloudflare previews.
- Run `pnpm test` for the Vitest suite, or scoped variants: `pnpm test:api`, `pnpm test:front`, `pnpm test:scrapers`; append `--watch` locally.
- Database migrations rely on `pnpm db:generate` and `pnpm db:migrate`; studio launches via `pnpm db:studio`.

## Coding Style & Naming Conventions
- TypeScript modules use `xo` + Prettier; format before pushing with `pnpm lint` or `pnpm lint:fix`.
- Prefer tabs for indentation (existing codebase style) and single quotes; keep files ESM (`type: module`).
- Follow domain-driven naming: PascalCase for React components/services, camelCase for helpers, dot-separated Remix route filenames (e.g. `admin.movies.$id.tsx`).
- Shared types live in `api/src/types` and `scrapers/src/types`; co-locate tests as `.test.ts`/`.test.tsx`.

## Testing Guidelines
- Vitest is configured via `vitest.config.ts` and `vitest.front.config.ts`; front-end tests rely on JSDOM/MSW, API tests run against Cloudflare Workers shim.
- Use descriptive `*.test.ts(x)` names mirroring source folders; integration tests for routes belong in `front/app/routes` alongside page files.
- Collect coverage with `pnpm test -- --coverage`; review reports under `coverage/` and `test-results/`.
- For data pipelines, add fixture seeds under `scrapers/src/__tests__/fixtures` and validate idempotency.

## Commit & Pull Request Guidelines
- Commit history follows Conventional Commits (`feat`, `fix`, `chore`, optional scope like `fix(api): …`); keep summaries imperative and ≤72 chars.
- Reference issues in the body (`Refs #123`) and detail database or schema updates explicitly.
- Pull requests should summarize scope, list test commands executed, and include screenshots or cURL examples for UI/API changes.
- Ensure schema or OpenAPI adjustments update `api/openapi.yml` and regenerate artifacts (`pnpm docs:bundle`) before review.

## Environment & Configuration Notes
- Cloudflare credentials and LibSQL URLs are loaded via `.env` variables consumed by `scripts/setup-database-environment.cjs`; never commit secrets.
- When using the scrapers, populate `tmp/` instead of `data/` until outputs are vetted, and clean transient artifacts before submitting PRs.
- Always use context7 when I need code generation, setup or configuration steps, or library/API documentation. This means you should automatically use the Context7 MCP tools to resolve library id and get library docs without me having to explicitly ask.
