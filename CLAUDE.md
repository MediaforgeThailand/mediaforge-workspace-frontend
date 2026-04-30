# CLAUDE.md — mediaforge-workspace-frontend

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The MediaForge **Workspace** product — a node-based canvas editor
for chaining AI tools, deployed at **workspace.mediaforge.co**.

Companion backend: `mediaforge-workspace-backend`
(Supabase project `fymncypboeubdikpbmqc`, dedicated to workspace).

## Workspace V2 Entry Points

- `/app/workspace`              — Dashboard (list of spaces)
- `/app/workspace/:workspaceId` — Full-screen canvas page (desktop only, mobile blocked)

Code surface:
- `src/components/workspace/*`         — node UIs, canvas, side-panels, sharing
- `src/store/useWorkspaceStore.ts`     — Zustand store (workspaces, canvases, history, tombstones)
- `src/store/useDebugLogStore.ts`      — run / retry debug log lines
- `src/store/useBackgroundExecutionStore.ts` — background task execution state
- `src/store/useWorkspaceShareRole.ts` — share token role tracking (owner/editor/viewer)
- `src/pages/workspace/{index,Canvas}.tsx` — dashboard + canvas pages
- `src/components/workspace/canvasPersistence.ts` — server-side canvas save/load
- `src/components/workspace/workspaceSchema.ts` — node type definitions + AI provider schema
- `src/lib/nodeCostCalculator.ts`      — client-side credit cost lookup
- Backend edge fn: `workspace-run-node` (in workspace-backend repo)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server on port 8080
npm run build        # Production build (TypeScript check + Vite build)
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)
npx playwright test  # E2E tests (Chromium + Mobile Chrome)
npx playwright test __tests__/e2e/public-pages.spec.ts  # Single E2E spec
```

## Architecture

```
React SPA (Vite) → Supabase Edge Functions (Deno) → AI Providers
                     ├── PostgreSQL (RLS)
                     ├── Auth (Email + Google OAuth + Phone OTP)
                     └── Storage Buckets
```

**Frontend:** React 18 + TypeScript + Vite (SWC plugin). UI is shadcn/ui + Radix + Tailwind CSS ("Midnight Neon" dark theme). Routing via react-router-dom v6 with lazy-loaded pages. State via Zustand + React Query + Context (AuthContext, LanguageContext).

**Canvas:** `@xyflow/react` v12 — node-based flow editor with custom node types, drag-and-drop, and keyboard shortcuts.

**3D:** three.js + @react-three/fiber + @react-three/drei + @google/model-viewer for 3D model preview.

**Backend:** Supabase project `fymncypboeubdikpbmqc`. Edge Functions in the workspace-backend repo.

**Path alias:** `@` maps to `src/` (configured in tsconfig.json and vite.config.ts).

## Route Structure

### Public
- `/` — Redirects to `/app/workspace`
- `/auth` — Login / Signup (email, Google OAuth, phone OTP)
- `/reset-password` — Password reset
- `/enroll-class/:code` — Student class enrollment landing
- `/privacy`, `/terms`, `/refund`, `/aup`, `/cookies` — Legal pages

### Protected (ProtectedRoute)
- `/app/workspace` — Workspace dashboard (space list)
- `/app/workspace/:workspaceId` — Full-screen canvas editor
- `/app/settings` — User settings
- `/app/usage` — Credit usage history
- `/app/pricing` — Plan picker

### Org Admin (protected, requires org membership)
- `/app/org-admin` — Teacher Center (class list, member management, analytics, enrollment codes)
- `/app/org-admin/branding` — Org branding settings

## Internationalization (i18n)

All user-facing text **must** be translated via `LanguageContext`. Supported languages: English (`en`) and Thai (`th`).

- Translations live in `src/contexts/LanguageContext.tsx` inside the `translations` object
- Use `const { t } = useLanguage()` to access translated strings
- Every label, button text, placeholder, toast message, error message, and page heading must use `t("keyName")` — never hardcode display strings
- When adding new pages or components, add keys to **both** `en` and `th` sections in `LanguageContext.tsx`
- Key naming convention: camelCase, prefixed by feature area (e.g. `authLoginFailed`, `settingsDeleteAccount`, `pricingPlanTitle`)

## Key Architectural Patterns

### Workspace Canvas
- `@xyflow/react` v12 canvas for node-based AI tool chaining
- Node types defined in `workspaceSchema.ts` (single source of truth)
- Canvas state persisted via `canvasPersistence.ts` (debounced autosave + `sendBeacon` on unload)
- Workspace metadata stored in Zustand (localStorage-backed), canvas graphs stored server-side

### Workspace Sharing
- Three roles: **owner** (full access), **editor** (run nodes, layout edits local only), **viewer** (read-only)
- Share tokens managed via edge functions (`workspace_share_create`, `workspace_share_list`, `workspace_share_revoke`)
- Components: `ShareDialog.tsx`, `ShareModeBanner.tsx`, `useShareTokenResolution.ts`

### Credit System
- 1 THB = 50 Workspace Credits (different from legacy consumer app's 125/THB)
- INTEGER math throughout, no floating-point
- `consume_credits` RPC uses `pg_advisory_xact_lock` per user
- Deduction order: top-up batches first (FIFO by expiry), then subscription batches
- Client-side cost preview via `src/lib/nodeCostCalculator.ts`

### Auth
- `ProtectedRoute` wraps all `/app/*` routes — redirects to `/auth` when unauthenticated
- `AuthContext` manages user session, profile, and org membership
- `handle_new_user` DB trigger auto-creates profiles + user_credits + user_roles on signup
- Org users routed via `mf-um-resolve-login` edge function (email-domain → org mapping)

### Organization / Multi-tenant
- Organizations (schools/universities/enterprises) with credit pools
- Classes under orgs with own rosters + credit policies
- Teacher Center (`/app/org-admin`) for class management, enrollment codes, analytics
- Student enrollment via QR code / enrollment code (`/enroll-class/:code`)

## AI Providers Integrated

Kling AI (video), Seedance (video), SeedDream (image), OpenAI GPT-Image-2 (image),
Google Gemini (chat + image), Tripo3D (3D models), ElevenLabs (TTS),
Google Cloud TTS, Replicate BiRefNet (background removal), Freepik (stock images)

## Testing

- **Unit:** Vitest with jsdom, setup in `src/test/setup.ts`
- **E2E:** Playwright in `__tests__/e2e/` — specs for public pages, dashboard, creator, and admin flows
- E2E fixtures in `__tests__/e2e/fixtures.ts` provide `signIn`/`adminSignIn` helpers and test user constants

## Key Libraries

| Library | Version | Purpose |
|---|---|---|
| react | 18.3.1 | UI framework |
| @xyflow/react | 12.10.0 | Node-based canvas editor |
| zustand | 5.0.12 | Client state management |
| @tanstack/react-query | 5.83.0 | Server state / caching |
| @supabase/supabase-js | 2.94.1 | Backend client |
| tailwindcss | 3.4.17 | Styling |
| three / @react-three/fiber | 0.160.1 / 8.18.0 | 3D rendering |
| @stripe/stripe-js | 9.2.0 | Payment integration |
| framer-motion | 12.34.0 | Animations |
| posthog-js | 1.367.0 | Analytics |
| zod | 3.25.76 | Schema validation |
