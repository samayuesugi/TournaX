# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Key Features

- **Tournament Matches**: Players join matches with entry fees, hosts manage room IDs, results distributed automatically
- **Live Countdown**: Match cards show prominent live countdown timers for upcoming matches (HH:MM:SS)
- **YouTube-like Filter**: Home page has a filter button (sliders icon) opening a bottom sheet with category, mode, map, and free/paid filters; active filters shown as chips
- **Team Auction System**: Admin creates auctions with teams/players, users bid on teams, rewards distributed proportionally to winners' bidders
- **Wallet System**: Gold Coins (GC) for match entry/auctions, Silver Coins for daily tasks, deposit/withdrawal via admin approval
- **Leaderboard**: Player rankings by wins, matches played, or earnings
- **Social**: Follow hosts, chat (DMs + group), profile pages
- **Admin Panel**: Manage players, hosts, finance, complaints, auctions
- **Esports Category**: Hosts with Esports verification can create Esports-category matches; visible only to Esports players
- **Auto Prize Pool**: Showcase prize = slots × entry fee + host contribution (auto-calculated, read-only)
- **Reward Distribution Table**: Battle Royale has customizable position rewards (1st 30%, 2nd 25%, 3rd 15%, MVP 10%; host/platform 10% each locked); Clash Squad/Lone Wolf fully locked (winner 90%, host/platform 5% each)
- **Mandatory Result Screenshots**: Hosts must upload 1-5 in-game result screenshots when submitting results; auto-deleted after 3 days; stored in `result_screenshot_urls` column
- **Game Verification Flow**: Players get a unique code (#TX-XXXX), add it to their in-game name, upload a profile screenshot, and AI (Gemini 2.5 Flash) verifies the code + auto-extracts IGN and UID. Verified badge shown on profile.
- **Trust Score System**: Players start at 500 points; score changes based on match completions, disputes, profile actions; tiers: Risky/Beginner/Trusted/Veteran/Elite
- **Host Reputation System**: After each match, players rate hosts on prize timeliness, room code sharing, and overall experience (1-5 stars); host badges auto-assigned
- **Escrow Prize System**: All match prize funds locked in escrow when match goes live; auto-distributed to winners after AI result verification; hosts cannot touch prize pool

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── tournax/            # React frontend (gaming tournament platform)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/tournax` (`@workspace/tournax`)

React 19 + Vite frontend for the TournaX gaming tournament platform. Dark-themed esports UI.

- **Tech**: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, Wouter (routing), TanStack Query
- **Auth**: JWT stored in localStorage, injected via `setAuthTokenGetter` from the API client
- **Theme**: Always-dark gaming theme — navy background, purple primary, cyan accent
- **Roles**: `player`, `host`, `admin` — each gets different pages/navigation
- **Pages**:
  - `/auth` — Login / Register (tabs)
  - `/setup-profile` — One-time profile setup after registration
  - `/` — Match lobby with search + status filters (player/host)
  - `/matches/:id` — Match detail with join, room credentials, host controls
  - `/my-matches` — Active & history tabs (player/host)
  - `/profile` / `/profile/:handle` — Own profile + public profiles with follow
  - `/wallet` — Gold Coins balance, Silver Coins (with earn rules + conversion), add money (UTR), withdrawals (UPI)
  - `/explore` — Browse hosts and players
  - `/notifications` — Notification list
  - `/host/create-match` — Create tournament (host only)
  - `/admin` — Dashboard stats, create host/admin
  - `/admin/players` — Player list, verify/ban/add balance
  - `/admin/finance` — Approve/reject deposits & withdrawals
  - `/admin/complaints` — View complaints
- **Key files**:
  - `src/contexts/AuthContext.tsx` — Auth state management
  - `src/lib/auth.ts` — Token storage helpers
  - `src/components/layout/AppLayout.tsx` — Main layout with header + bottom nav
  - `src/components/match/MatchCard.tsx` — Reusable match card

### Database Setup

Run `pnpm --filter @workspace/db run push` to push/sync the schema to the database. This must be done after initial setup or any schema changes.

**Default seeded accounts (created once on fresh DB):**
- Admin: `admin@tournax.com` / `admin@123`
- Host: `host@tournax.com` / `host@123`
- Players register themselves via the Sign Up form

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
