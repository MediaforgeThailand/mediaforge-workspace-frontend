# MediaForge — Tech Handoff (Summary)

> **For:** Senior Fullstack Developer | **Updated:** 2026-02-22  
> **Stack:** React 18 + Vite + TS | Supabase (Lovable Cloud) | Stripe | Kling AI + Lovable AI Gateway

---

## 1. Architecture Overview

```
React SPA ──→ Supabase Edge Functions (Deno) ──→ External APIs
                    │                                ├── Kling AI (video)
                    │                                ├── Lovable AI Gateway (image/text)
                    ├── PostgreSQL (RLS)             ├── Google AI Studio (TTS)
                    ├── Auth (Email + Google OAuth)   ├── Stripe (payments)
                    └── Storage Buckets              └── Freepik (stock)
```

### Dual Execution Paths

| Path | Function | Use Case |
|---|---|---|
| **Single-node async** | `run-flow-init` | Consumer runs via `/play/:flowId` — dispatches one node, returns `task_id` for polling |
| **Multi-node sequential** | `run-flow` | Complex flows — topological sort → execute all nodes in order |

Both paths: **deduct credits upfront → call API → auto-refund on failure**.

### Flow Studio (Creator Side)

- `@xyflow/react` v12 canvas, nodes defined in `nodeApiSchema.ts` (single source of truth)
- Creators mark params as `exposed_to_user` → these appear in PlayFlow consumer form
- Graph stored in `flow_nodes` table + `flows.settings.graph` JSON (dual storage, known debt)

### AI Providers

| Provider | Auth | Edge Function |
|---|---|---|
| **Kling** (video) | Custom JWT (HS256, `KLING_ACCESS_KEY_ID` + `KLING_SECRET_KEY`) | `generate-video`, `run-flow-init`, `run-flow-status` |
| **Lovable Gateway** (image/text) | Bearer `LOVABLE_API_KEY` | `generate-image`, `run-flow` |
| **Google AI Studio** (TTS) | API key `GOOGLE_AI_STUDIO_KEY` | `text-to-speech` |

### Prompt Enhancement (No RAG Pipeline)

- `prompt_knowledge` table: static knowledge entries injected as system prompts
- `brand_contexts` table: per-user brand info for template variable injection
- `presets` / `angle_prompts`: pre-built prompt templates

---

## 2. Key Database Tables

```
auth.users ──trigger──→ profiles (1:1) + user_credits (1:1) + user_roles (1:1)

profiles: subscription_status, creator_rank, stripe_customer_id, subscription_plan_id
user_credits: balance (INTEGER — source of truth), total_purchased, total_used
credit_batches: per-batch tracking with expiry (top-up=12mo, subscription=1mo)
credit_transactions: immutable ledger (amount INTEGER, balance_after INTEGER)
flows: base_cost (INT), markup_multiplier (NUMERIC), is_official, status
flow_nodes: node_type, config (JSONB with params + connections + exposed map)
flow_runs: status, credits_used, inputs/outputs (JSONB)
subscription_plans: upfront_credits, discount_official/community, flow_quota
credit_costs: feature + model + duration → cost (INT) lookup
creator_stats: VIEW aggregating flows + flow_runs per creator
```

**All credit math uses INTEGER** — no floating-point. `markup_multiplier` uses Postgres `NUMERIC`.

---

## 3. Monetization Engine

### Exchange Rate: **1 THB = 25 Credits**

### Pricing Formulas

| Scenario | Formula | Example (700 base, 2.5x) |
|---|---|---|
| **Creator test** | `ceil(base × 1.1)` | 770 credits |
| **Consumer run** | `ceil(base × markup)` | 1,750 credits |
| **RevShare** | `floor((finalPrice - base) × 0.20)` → to creator | 210 credits |
| **Discount** | `floor(rawPrice × discount% / 100)` subtracted | varies by plan |

### Credit Consumption (`consume_credits` RPC)

1. `pg_advisory_xact_lock` per user (prevents race conditions)
2. Check total across non-expired batches
3. Deduct **Top-up batches first** (FIFO by expiry), then subscription batches
4. Update `user_credits.balance`, log to `credit_transactions`

### Stripe Flow

```
Subscribe → create-checkout → Stripe Checkout → stripe-webhook
  checkout.session.completed → grant upfront_credits, create batch, update profile
  invoice.paid (monthly renewal) → re-grant credits
  invoice.paid (annual renewal) → skip (already granted upfront)
  customer.subscription.deleted → reset to free
```

Top-up: `create-topup` → one-time payment → 12-month batch

### Refund on API Failure

Create `credit_batch` (30-day, source=topup) + increment balance + log `type='refund'` + set `flow_runs.status='failed_refunded'`

---

## 4. Edge Function Registry

| Function | Auth | Calls | Notes |
|---|---|---|---|
| `run-flow-init` | JWT | Kling / Lovable Gateway | Single-node dispatcher, upfront billing, auto-refund |
| `run-flow` | JWT | All AI providers | Multi-node sequential, topo-sort, full pipeline |
| `run-flow-status` | JWT | Kling | Polls task, updates `flow_runs`, refunds on fail |
| `generate-image` | JWT | Lovable Gateway | Gemini 3 Pro Image, base64→storage upload |
| `generate-video` | JWT | Kling | All Kling models, returns `task_id` |
| `text-to-speech` | JWT | Google AI Studio | PCM→WAV, rate limited 15/min |
| `create-checkout` | JWT | Stripe | Subscription checkout, handles upgrades |
| `create-topup` | JWT | Stripe | One-time top-up checkout |
| `stripe-webhook` | Stripe sig | Stripe | All payment events |
| `customer-portal` | JWT | Stripe | Billing portal session |
| `get-stripe-key` | JWT | — | Returns publishable key |
| `freepik-stock` | JWT | Freepik | Search + download proxy |

### Pre-Auth Pattern (all execution functions)

`Auth JWT → lookup cost → calculate price → consume_credits → call API → refund if fail`

### Secrets

`KLING_ACCESS_KEY_ID`, `KLING_SECRET_KEY`, `LOVABLE_API_KEY`, `GOOGLE_AI_STUDIO_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `FREEPIK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

---

## 5. State Management & Auth

| State | Where | Notes |
|---|---|---|
| Auth / Profile | `AuthContext` (global) | Supabase Auth, auto-provisions profile via trigger |
| Credits | `useCredits()` hook | Queries `user_credits`, explicit `refetch()` (no realtime) |
| Language | `LanguageContext` | Global i18n |
| Theme | `ThemeProvider` (next-themes) | localStorage persisted |
| Flow editor | `useFlowEditor()` | Per FlowStudio page |
| Server cache | `@tanstack/react-query` | Per-query invalidation |

### Auth Flow

`ProtectedRoute` wraps all dashboard/play routes. `handle_new_user` trigger creates `profiles` + `user_credits` + `user_roles` on signup.

---

## 6. Known Technical Debt

1. **Dual execution paths** duplicate pricing logic — should extract shared module
2. **Dual graph storage** (`flow_nodes` table vs `flows.settings.graph` JSON) — inconsistent
3. **HTTP polling** (7s) for execution progress — no WebSocket/Realtime
4. **Camera control** only works natively on `kling-v1` — others use text fallback
5. **No scheduled cron** for `expire_credit_batches()` — only triggered on SELECT
6. **`nodeApiSchema.ts`** will grow with each new AI provider

---

## 7. Frontend Quick Reference

### Routing (all lazy-loaded)

```
/                    Landing       /explore              Marketplace
/auth                Login/Signup  /play/:flowId         Consumer execution
/dashboard/home      Dashboard     /dashboard/flow-studio     Flow list
/dashboard/flow-studio/:flowId     Flow editor (fullscreen)
/dashboard/creator   Creator dash  /dashboard/pricing    Plans + top-up
/dashboard/community Gallery       /dashboard/settings   Profile
/dashboard/stock     Freepik       /dashboard/transactions    Credit history
/dashboard/assets    Asset mgr     /dashboard/admin      Admin panel
```

### Design System ("Midnight Neon")

- Background: `#0a0e1a` (HSL 222 50% 7%)
- Accents: purple/pink gradients
- Cards: glassmorphism (`backdrop-blur`, `bg-card/50`)
- Animations: Framer Motion
- Components: shadcn/ui + Radix

---

*End of Summary*
