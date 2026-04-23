# MediaForge

AI-powered media creation SaaS for Thai SMEs. Creators build visual AI workflows (image generation, video generation, text-to-speech) and consumers run them using a credit-based system.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite (SWC), Tailwind CSS, shadcn/ui |
| State | React Query, Context API (Auth, Language, Theme) |
| Routing | react-router-dom (lazy-loaded pages) |
| Flow Editor | @xyflow/react v12 (node-based canvas) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | PostgreSQL with Row-Level Security |
| Auth | Supabase Auth (Email + Google OAuth) |
| Payments | Stripe (subscriptions + top-ups) |
| External APIs | Kling AI, Google AI Studio, Freepik |

## Prerequisites

- **Node.js** >= 20 ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- **npm** (comes with Node.js)
- **Deno** >= 2.x (for edge function tests — install via `npm install -g deno`)
- **Supabase CLI** (optional, for edge function development)
- **VS Code: Deno extension** (`denoland.vscode-deno`) — required to avoid TypeScript errors in `supabase/functions/`

## Getting Started

```bash
# Clone the repository
git clone <REPO_URL>
cd magic-media-lab

# Copy the example env file and fill in your values
cp .env.example .env

# Install dependencies
npm install

# Start the dev server (runs on port 8080)
npm run dev
```

## Available Scripts

```bash
npm run dev          # Dev server with HMR
npm run build        # Production build (TypeScript check + Vite)
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Run unit tests (Vitest, single run)
npm run test:watch   # Run unit tests (watch mode)
npm run test:edge    # Run edge function tests (Deno)
npm run edge:serve   # Serve edge functions locally
npx playwright test  # Run E2E tests (Chromium + Mobile Chrome)
```

## Project Structure

```
src/
  assets/          # Static assets (images, animations)
  components/      # Reusable UI components (shadcn/ui based)
  contexts/        # React Context providers (Auth, Language, Theme)
  hooks/           # Custom React hooks
  integrations/    # Supabase client config and generated types
  lib/             # Utilities, helpers, pricing logic
  pages/           # Route-level page components
  test/            # Test setup and utilities
  types/           # Shared TypeScript types

supabase/
  functions/       # Edge Functions (Deno runtime) + tests (index.test.ts)
  migrations/      # SQL migration files

__tests__/
  e2e/             # Playwright E2E test specs
```

### Path Alias

`@` maps to `src/` — use `@/components/...`, `@/lib/...`, etc. in imports. Configured in both `tsconfig.json` and `vite.config.ts`.

## Architecture Overview

```
React SPA
  └─> Supabase Edge Functions (Deno)
        ├── PostgreSQL (RLS)
        ├── Auth (Email + Google OAuth)
        ├── Storage Buckets
        └── External APIs (Kling AI, Google AI Studio, Stripe, Freepik)
```

### User Roles

- **Consumer** (`/app/*`) — Browse and run AI workflows, manage credits
- **Creator** (`/creator/*`) — Build and publish AI workflows via Flow Studio
- **Admin** (`/admin/*`) — Review submissions, manage platform settings (separate auth)

### Key Concepts

**Flow Studio** — Node-based visual editor where creators wire up AI provider nodes (image gen, video gen, TTS) into reusable workflows. Schemas are defined in `src/lib/nodeApiSchema.ts`.

**PlayFlow** (`/play/:flowId`) — Consumer-facing execution page. Runs a flow's nodes, deducts credits upfront, calls external APIs, and auto-refunds on failure.

**Credit System** — 1 THB = 25 Credits (integer math only). Credits are consumed from top-up batches first (FIFO by expiry), then subscription batches. Pricing rules live in `src/lib/flowPricing.ts`.

### Routes

| Path | Access | Description |
|------|--------|-------------|
| `/` | Public | Landing page |
| `/auth` | Public | Login / Signup |
| `/app/*` | Protected | Consumer dashboard (home, flow-studio, community, stock, assets, pricing, settings, transactions) |
| `/play/:flowId` | Protected | Run a published flow |
| `/creator/*` | Protected | Creator workspace (studio, published, flows, analytics) |
| `/admin/*` | Admin auth | Admin panel (dashboard, review queue, settings) |

### Edge Functions

Located in `supabase/functions/`. All execution functions follow the same pattern:

```
Auth JWT → lookup cost → calculate price → consume_credits → call API → refund if fail
```

Key functions: `run-flow-init`, `run-flow`, `run-flow-status`, `generate-image`, `generate-video`, `text-to-speech`, `create-checkout`, `create-topup`, `stripe-webhook`, `freepik-stock`, `admin-login`, `admin-api`

## Testing

**Unit tests** — Vitest with jsdom. Setup file at `src/test/setup.ts`.

```bash
npm run test              # Single run
npm run test:watch        # Watch mode
```

**Edge Function tests** — Deno tests in `supabase/functions/*/index.test.ts`. These make HTTP requests to your Supabase Edge Functions (deployed or local).

> **VS Code setup:** Install the [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) (`denoland.vscode-deno`) to resolve `Deno` types and remove "Cannot find name 'Deno'" errors. The workspace is already configured to enable Deno only inside `supabase/functions/`.

```bash
npm run test:edge         # Run all edge function tests
npm run test:edge:watch   # Watch mode
npm run edge:serve        # Serve functions locally (for testing against localhost)
```

**Running edge function tests against remote (default):**

By default, tests use `VITE_SUPABASE_URL` from your `.env` (pointing to your deployed Supabase project). Just run:

```bash
npm run test:edge
```

**Running edge function tests locally:**

To test against a local Supabase instance instead of the deployed project:

1. Make sure **Docker** is running
2. Start the local Supabase stack:
   ```bash
   supabase start
   ```
   This prints your local credentials (`anon key`, `service_role key`, `API URL`, etc.)
3. In a separate terminal, serve the edge functions:
   ```bash
   npm run edge:serve
   ```
4. Update your `.env` to point to the local instance:
   ```env
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase start>
   ```
5. Run the tests:
   ```bash
   npm run test:edge
   ```

> **Tip:** You can keep a separate `.env.local` and swap between local/remote by copying it over `.env` before running tests. To run a single function's tests:
> ```bash
> deno test supabase/functions/generate-image/index.test.ts --allow-net --allow-env --allow-read --env-file=.env
> ```

**E2E tests** — Playwright specs in `__tests__/e2e/`. Test fixtures in `__tests__/e2e/fixtures.ts` provide `signIn`/`adminSignIn` helpers.

```bash
npx playwright test                                       # All specs
npx playwright test __tests__/e2e/public-pages.spec.ts    # Single spec
```

E2E specs cover: public pages, dashboard, creator pages, admin pages, and PlayFlow execution.

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. See the example file for descriptions of where to find each key.

### Frontend (Required)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |

These are the minimum required to run the frontend locally (`npm run dev`).

### Supabase Edge Functions

These are configured as secrets in the Supabase dashboard for production. For local edge function development (`supabase functions serve`), add them to your `.env`.

| Variable | Used By | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | All functions | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | Privileged backend access |
| `SUPABASE_ANON_KEY` | 7 functions | Public Supabase key |
| `JWT_SECRET` | admin-login, admin-api | Admin JWT signing key |
| `STRIPE_SECRET_KEY` | create-checkout, create-topup, customer-portal, stripe-webhook | Stripe API secret |
| `STRIPE_PUBLISHABLE_KEY` | get-stripe-key | Stripe public key |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | Stripe webhook signature verification |
| `KLING_ACCESS_KEY_ID` | generate-video, run-flow-init, run-flow-status, run-flow, execute-pipeline-step | Kling AI access key |
| `KLING_SECRET_KEY` | generate-video, run-flow-init, run-flow-status, run-flow, execute-pipeline-step | Kling AI secret key |
| `GOOGLE_AI_STUDIO_KEY` | generate-image, text-to-speech, run-flow-init, execute-pipeline-step | Google AI Studio API key |
| `OPENAI_API_KEY` | execute-pipeline-step, run-flow-init | OpenAI API key (optional) |
| `FREEPIK_API_KEY` | freepik-stock | Freepik API key |
| `LOVABLE_API_KEY` | run-flow | Lovable gateway API key |

### Setting Secrets for Deployed Functions

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_... KLING_ACCESS_KEY_ID=... KLING_SECRET_KEY=...
```

## Deployment

The app is deployed via [Lovable](https://lovable.dev). Changes pushed to the repo are automatically reflected in Lovable, and vice versa.
