# Repository Guidelines

## Project Structure & Module Organization

- The repo is a pnpm workspace: `apps/api`, `apps/front`, `apps/scrapers`, plus shared packages `packages/database` (Drizzle schema, migrations, seeds), `packages/utils`, and `packages/types`. One-off DB scripts live in `scripts/`.
- Cloudflare Worker code sits in `apps/api/src` with route files under `routes/` and middleware/services folders; tests reside in `apps/api/src/__tests__`.
- The React Router v7 front end lives in `apps/front/app` (routes named with dot-segments), static assets in `apps/front/public`, and worker builds in `apps/front/build`.
- Scraper CLIs are in `apps/scrapers/src` with per-festival directories and matching `__tests__`; run outputs to `data/` and `tmp/`.

## Build, Test, and Development Commands

- Use `pnpm install` to sync workspaces (Node 22, see `.tool-versions`).
- `pnpm dev` boots API (`wrangler`) and front dev server concurrently; run package-specific dev with `pnpm api:dev` or `pnpm front:dev`. Note: `pnpm --filter @shine/api run dev` skips the DB environment setup that the root scripts perform — prefer the root scripts.
- Execute `pnpm front:build` for production assets, and `pnpm api:deploy:prod` / `pnpm front:deploy:prod` to deploy (production only; the dev environment is not used).
- Run `pnpm test` for the Vitest suite, or scoped variants: `pnpm test:api`, `pnpm test:front`, `pnpm test:scrapers`.
- Database migrations rely on `pnpm db:generate` and `pnpm db:migrate` (`:prod` variants for production); studio launches via `pnpm db:studio`.

## Coding Style & Naming Conventions

- TypeScript modules use ESLint (flat config) + Prettier; format before pushing with `pnpm lint:fix` (runs eslint --fix and prettier --write).
- Indentation is 2 spaces (Prettier default) with single quotes; keep files ESM (`type: module`).
- Follow domain-driven naming: PascalCase for React components/services, camelCase for helpers, dot-separated route filenames (e.g. `admin.movies.$id.tsx`).
- Shared types live in `packages/types`; co-locate tests as `.test.ts`/`.test.tsx`.

## Testing Guidelines

- Vitest is configured via `vitest.config.ts` (node + jsdom projects); CI runs `pnpm test`.
- Use descriptive `*.test.ts(x)` names mirroring source folders; route tests live in `apps/front/app/routes` alongside page files.
- API tests that need a real database use a libsql `file:` URL with `migrate()` (see `apps/api/src/__tests__/reselect-exclude.test.ts` for the pattern).
- For data pipelines, add fixture seeds under `apps/scrapers/src/__tests__` and validate idempotency.

## Commit & Pull Request Guidelines

- Commit history follows Conventional Commits (`feat`, `fix`, `chore`, optional scope like `fix(api): …`); keep summaries imperative and ≤72 chars.
- Reference issues in the body (`Refs #123`) and detail database or schema updates explicitly.
- Pull requests should summarize scope concisely (no boilerplate Summary/Test Plan sections).
- Ensure schema or OpenAPI adjustments update `apps/api/openapi.yml` and pass `pnpm docs:validate` before review.

## Environment & Configuration Notes

- Turso credentials and API keys are loaded from `.dev.vars` at the repo root via `scripts/setup-database-environment.cjs` (API/DB) and `apps/scrapers/src/common/environment.ts` (scraper CLIs); never commit secrets.
- When using the scrapers, populate `tmp/` instead of `data/` until outputs are vetted, and clean transient artifacts before submitting PRs.
