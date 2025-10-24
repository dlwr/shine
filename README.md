# shine

## Monorepo Layout

- `apps/api` – Cloudflare Worker API (Hono)
- `apps/front` – Remix-based admin frontend
- `apps/scrapers` – CLI scrapers and automation jobs
- `packages/database` – Drizzle ORM schema, migrations, seeds, shared DB helpers
- `packages/utils` – Cross-application utility helpers
- `packages/types` – Shared domain types for API, front end, and tooling

Run workspace commands with pnpm (e.g. `pnpm --filter @shine/api run dev`).
