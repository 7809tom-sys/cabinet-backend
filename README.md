# Cabinet Dealz — backend

Express + tRPC API for Cabinet Dealz. Deployed on **Railway**; the React frontend is a separate static site on Vercel.

- Runtime: Node ≥ 22, pnpm 10.4.1 (`packageManager`)
- Database: TiDB Cloud (MySQL) via Drizzle — schema and migrations in `drizzle/`
- Auth: Supabase Auth (`Authorization: Bearer <access token>` verified with `SUPABASE_JWT_SECRET`)
- Files: Supabase Storage (`site-media`, `private-files`), served through `/manus-storage/<key>` (legacy URL prefix kept so stored URLs keep working)
- AI: Gemini (text + images) · Geocoding: Google Geocoding API · Email: SMTP

## Run

```bash
pnpm install --frozen-lockfile
cp .env.example .env        # fill in values
pnpm run build:server       # esbuild → dist/index.js
SERVE_CLIENT=false pnpm start
```

`GET /health` → `{"ok":true}`. See `.env.example` for every variable and `DEPLOY.md` for the Railway/Vercel setup.

## Notes

- This repository contains only the backend. A few shared modules live under `shared/`, and one data module the server needs
  is under `client/src/lib/` (`pelicanFixtureProfiles.ts`). The frontend itself is not here.
- `package.json` still lists the frontend dependencies and scripts (`build:client`, `dev`); only `build:server` and `start` apply here.
- Tests: `pnpm exec vitest run`. About 70 test files need a database (`DATABASE_URL`) and fail without one.
- Keep the Railway service at **one replica**: a `node-cron` job runs inside the server.
- `server/scripts/pdf_to_xlsx.py` (distributor PDF import) needs Python and its libraries on the host.
