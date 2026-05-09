# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Belle Software Messaging** — multi-tenant SaaS for managing WhatsApp messaging on top of Belle Software data. UI/copy is in pt-BR. Cron, the real Belle REST integration, and outbound sending via Evogo are out of scope for v1; the schema already accommodates them. See `.lovable/plan.md` for the v1 product spec.

## Commands

Package manager is **bun** (`bun.lock`). `package-lock.json` is also present but `bun` is the source of truth.

```bash
bun install
bun run dev          # vite dev — TanStack Start on Cloudflare Workers (via @cloudflare/vite-plugin)
bun run build        # production build
bun run build:dev    # build with development mode
bun run preview      # preview built output
bun run lint         # eslint .
bun run format       # prettier --write .
```

There is no test runner configured.

## Stack and entry points

- **TanStack Start** (SSR React 19) deployed to **Cloudflare Workers**.
- **Supabase** ("Lovable Cloud") for auth + Postgres + RLS. Schema lives in `supabase/migrations/*.sql`.
- **shadcn/ui** (new-york style, slate base) on **Tailwind v4**, dark theme by default (`<html className="dark">` in `__root.tsx`). Path alias `@/*` → `src/*`.
- `src/server.ts` is the Worker entry — it wraps `@tanstack/react-start/server-entry` and converts h3-swallowed SSR errors (JSON `{unhandled: true, message: "HTTPError"}`) into a branded HTML 500 page. `src/start.ts` adds an analogous `errorMiddleware` for in-handler throws. Don't bypass these — keep error rendering routed through `renderErrorPage()`.
- `wrangler.jsonc` `main` AND `vite.config.ts` `tanstackStart.server.entry` both point at `server` — the Cloudflare plugin requires the vite-side override; wrangler's `main` alone is not enough.

## Critical: vite.config.ts and Lovable preset

`vite.config.ts` uses `defineConfig` from `@lovable.dev/vite-tanstack-config`. That preset **already includes**: `tanstackStart`, `viteReact`, `tailwindcss`, `vite-tsconfig-paths`, `cloudflare` (build-only), `componentTagger` (dev-only), `VITE_*` env injection, `@/*` alias, React/TanStack dedupe, error-logger plugins, and sandbox port/host detection. **Do not add any of these manually** — duplicating them breaks the app. Add custom config via `defineConfig({ vite: { ... } })`.

## Routing

File-based routes in `src/routes/`. `src/routeTree.gen.ts` is **auto-generated** by `@tanstack/router-plugin` — never edit it. Routes are flat (no `_authenticated/` layout segment despite what the plan doc shows): authenticated pages opt in by wrapping their UI in `<AppLayout>` from `src/components/app-layout.tsx`, which itself wraps `<AuthGuard>` (redirects to `/login` if unauthenticated). The root route in `src/routes/__root.tsx` provides `QueryClientProvider`, `AuthProvider`, and the `Toaster`.

Router context carries `{ queryClient }` (see `src/router.tsx`).

## Auth and multi-tenancy

`src/lib/auth-context.tsx` (`AuthProvider` + `useAuth`) is the single source of truth on the client. It tracks `user`, `session`, `roles: AppRole[]`, and `companyId` (loaded from `profiles` and `user_roles` on auth state change).

Tenancy model:

```
auth.users → profiles (1:1, profiles.company_id) → companies
                                                       └→ units → instances
                                                                └→ messages
```

Roles (enum `app_role`): `super_admin`, `company_admin`, `operator`. Roles live in a **separate `user_roles` table** (not on `profiles`) to avoid privilege escalation. Always check role via the `has_role(user_id, role)` SECURITY DEFINER function in SQL, or `roles.includes(...)` on the client.

RLS is enforced on every domain table via two SECURITY DEFINER helpers:
- `public.has_role(uuid, app_role)` — role check without recursing into `user_roles` policies
- `public.current_company_id()` — returns the caller's `profiles.company_id`

When adding new tables, follow the existing pattern: enable RLS, add a `super_admin` "manage all" policy, plus company-scoped SELECT/ALL policies that compare `company_id` (directly or via a join to `units`) against `current_company_id()`. `REVOKE EXECUTE` on any new SECURITY DEFINER function from `PUBLIC`/`anon`/`authenticated` as appropriate (see migration `20260507181648_*.sql`).

A trigger on `auth.users` (`handle_new_user`) auto-inserts a `profiles` row on signup; do not create profiles manually from client code.

## Supabase clients — pick the right one

`src/integrations/supabase/` files are marked **auto-generated** ("Do not edit it directly"). Treat them as generated; if changes are unavoidable, expect them to be overwritten when the Lovable integration regenerates.

- **`client.ts`** — browser client, anon key, persists session to `localStorage`. Subject to RLS. Import as `import { supabase } from "@/integrations/supabase/client"`.
- **`client.server.ts`** — service-role client, **bypasses RLS**. Server-only; never import from client code. Filename suffix `.server.ts` is the TanStack Start convention for server-only modules.
- **`auth-middleware.ts`** — `requireSupabaseAuth` middleware for server functions/routes. Validates the `Authorization: Bearer <token>` header via `getClaims`, then injects `{ supabase, userId, claims }` into the handler context. Use this (not `client.server.ts`) when you want **user-scoped** queries that still respect RLS on the server.

ESLint forbids importing `server-only` (the Next.js package) — use the `*.server.ts` filename or `@tanstack/react-start/server-only` instead.

## Environment variables

`.env` (committed for the publishable/anon key only):

- Server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (not in committed `.env`; required by `client.server.ts`).
- Client (Vite-injected): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

`client.ts` falls back from `import.meta.env.VITE_*` to `process.env.*` so the same module works in SSR and browser.

## Data fetching convention

Pages use **TanStack Query** (`useQuery`/`useMutation`) against the browser `supabase` client; RLS does the authorization. Mutations typically `queryClient.invalidateQueries` on the relevant key after success and `toast` via `sonner`. See `src/routes/dashboard.tsx`, `companies.tsx`, `units.$unitId.tsx` for the established pattern.

## Migrations

Add new migrations as `supabase/migrations/<timestamp>_<slug>.sql`. The two existing migrations show the pattern: schema + indexes + SECURITY DEFINER helpers + `set_updated_at` triggers + RLS policies, followed by a hardening migration that fixes function `search_path` and revokes execute privileges.
