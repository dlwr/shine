# shine

## Monorepo Layout

- `apps/api` – Cloudflare Worker API (Hono)
- `apps/front` – React Router v7 frontend (public pages + admin, Cloudflare Workers SSR)
- `apps/scrapers` – CLI scrapers and automation jobs
- `packages/database` – Drizzle ORM schema, migrations, seeds, shared DB helpers
- `packages/utils` – Cross-application utility helpers

Run workspace commands with pnpm (e.g. `pnpm --filter @shine/api run dev`).
