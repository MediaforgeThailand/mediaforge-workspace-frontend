# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediaForge — AI-powered media creation SaaS for Thai SMEs. React SPA frontend with Supabase backend (Edge Functions in Deno), deployed via Lovable.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server on port 8080
npm run build        # Production build (TypeScript check + Vite build)
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)
npx playwright test  # E2E tests (Chromium + Mobile Chrome)
npm run test:edge    # Edge function tests (Deno)
npx playwright test __tests__/e2e/public-pages.spec.ts  # Single E2E spec
```

## Architecture

```
React SPA → Supabase Edge Functions (Deno) → External APIs (Kling AI, Lovable Gateway, Google AI Studio, Stripe, Freepik)
              ├── PostgreSQL (RLS)
              ├── Auth (Email + Google OAuth)
              └── Storage Buckets
```

**Frontend:** React 18 + TypeScript + Vite (SWC plugin). UI is shadcn/ui + Radix + Tailwind CSS ("Midnight Neon" dark theme). Routing via react-router-dom with lazy-loaded pages. State via React Query + Context (AuthContext, LanguageContext, ThemeProvider).

**Backend:** Supabase project `qywqanfbmnhcleojzwtq`. Edge Functions in `/supabase/functions/` (Deno runtime). Migrations in `/supabase/migrations/`.

**Path alias:** `@` maps to `src/` (configured in tsconfig.json and vite.config.ts).

## Key Architectural Patterns

### Dual Execution Paths
- `run-flow-init`: Single-node async execution via `/play/:flowId` — dispatches one node, returns `task_id` for polling
- `run-flow`: Multi-node sequential — topological sort → execute all nodes in order
- Both follow: **deduct credits upfront → call API → auto-refund on failure**

### Flow Studio
- `@xyflow/react` v12 canvas for node-based flow editing
- Node types defined in `nodeApiSchema.ts` (single source of truth for AI provider schemas)
- Creators mark params as `exposed_to_user` → shown in consumer PlayFlow form
- Dual graph storage (known debt): `flow_nodes` table + `flows.settings.graph` JSON

### Credit System
- 1 THB = 25 Credits, all math uses INTEGER (no floating-point)
- `consume_credits` RPC uses `pg_advisory_xact_lock` per user
- Deduction order: top-up batches first (FIFO by expiry), then subscription batches
- Pricing in `src/lib/flowPricing.ts` with tier rules

### Auth
- `ProtectedRoute` wraps dashboard/play routes
- `AuthContext` for consumer auth, separate `AdminAuthContext` for admin panel
- `handle_new_user` DB trigger auto-creates profiles + user_credits + user_roles on signup

## Route Structure

- `/` — Landing, `/auth` — Login/Signup (public)
- `/app/*` — Consumer dashboard (protected): home, flow-studio, community, stock, assets, pricing, settings, transactions
- `/play/:flowId` — Flow execution (protected)
- `/creator/*` — Creator workspace (protected): studio, published, flows, analytics
- `/admin/*` — Admin panel (isolated auth): login, dashboard, review-queue, review/:flowId, flow-active, settings

## Edge Functions

All execution functions follow: `Auth JWT → lookup cost → calculate price → consume_credits → call API → refund if fail`

Key functions: `run-flow-init`, `run-flow`, `run-flow-status`, `generate-image`, `generate-video`, `text-to-speech`, `create-checkout`, `create-topup`, `stripe-webhook`, `freepik-stock`, `admin-login`, `admin-api`

## Known Technical Debt

1. Dual execution paths (`run-flow-init` vs `run-flow`) duplicate pricing logic
2. Dual graph storage (`flow_nodes` table vs `flows.settings.graph` JSON)
3. HTTP polling (7s interval) for execution progress — no WebSocket/Realtime
4. `nodeApiSchema.ts` grows with each new AI provider
5. No scheduled cron for credit batch expiry — only triggered on SELECT

## Testing

- **Unit:** Vitest with jsdom, setup in `src/test/setup.ts`
- **Edge Functions:** Deno tests in `supabase/functions/*/index.test.ts` — run with `npm run test:edge`
- **E2E:** Playwright in `__tests__/e2e/` — specs for public pages, dashboard, creator, and admin flows
- E2E fixtures in `__tests__/e2e/fixtures.ts` provide `signIn`/`adminSignIn` helpers and test user constants
