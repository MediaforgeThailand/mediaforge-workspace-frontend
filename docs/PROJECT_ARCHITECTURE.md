# PROJECT_ARCHITECTURE.md — MediaForge

> **Generated:** 2026-02-22 | **Status:** Reflects exact current codebase state

---

## 1. Project Overview

MediaForge is a React/TypeScript SaaS platform for AI-powered media creation targeting Thai SMEs. It operates on a **"Preset-First Automation"** philosophy — users consume pre-built AI workflows (Flow Studio Automations) rather than manually configuring pipelines.

The platform has two user modes:
- **Creator Mode (Flow Studio):** A ComfyUI-inspired node-based editor where creators build AI automation flows using drag-and-drop nodes.
- **Consumer Mode (PlayFlow):** End-users run published flows via simplified forms, seeing only parameters the creator chose to "expose."

**Brand Philosophy:** All third-party provider branding (Freepik, Kling, etc.) is removed from user-facing surfaces. The app presents itself as a unified brand.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State | TanStack React Query, React Context (Auth, Language, Theme) |
| Routing | react-router-dom v6 (lazy-loaded pages) |
| Flow Editor | @xyflow/react v12 (React Flow) |
| Animations | framer-motion |
| Backend | Supabase (Lovable Cloud): Postgres, Auth, Storage, Edge Functions (Deno) |
| Payments | Stripe (Checkout, Webhooks, Customer Portal) |
| AI: Video | Kling AI API (`api.klingai.com`) — direct JWT auth |
| AI: Image | Lovable AI Gateway → Google Gemini 3 Pro Image Preview |
| AI: Text | Lovable AI Gateway → OpenAI GPT-5 / Google Gemini 2.5 Flash |
| AI: TTS | Google AI Studio → Gemini 2.5 Flash Preview TTS |
| Stock Library | Freepik API (search + download only) |

---

## 3. Database Schema

### 3.1 Core User Tables

#### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto-generated |
| `user_id` | uuid UNIQUE | references auth.users (no FK constraint) |
| `display_name` | text | |
| `avatar_url` | text | |
| `company` | text | |
| `role` | text | |
| `subscription_status` | enum `free\|professional\|agency` | default `free` |
| `stripe_customer_id` | text | |
| `stripe_subscription_id` | text | |
| `billing_interval` | text | `monthly` or `annual` |
| `current_plan_id` | uuid | FK → credit_packages |
| `current_period_end` | timestamptz | |
| `subscription_plan_id` | uuid | FK → subscription_plans |
| `creator_rank` | enum `novice\|rising_star\|top_rated\|elite` | default `novice` |
| `created_at` / `updated_at` | timestamptz | |

#### `subscription_plans`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. Starter, Basic, Pro, Enterprise, Hobbyist, Studio |
| `target` | text | `user` or `creator` |
| `billing_cycle` | text | `monthly` or `annual` |
| `price_thb` | integer | |
| `upfront_credits` | integer | `price_thb × 25` |
| `flow_quota` | integer nullable | max flows (NULL = unlimited) |
| `discount_official` | numeric(5,2) | % discount on official flows |
| `discount_community` | numeric(5,2) | % discount on community flows |

#### `creator_stats` (materialized view)
| Column | Type | Notes |
|---|---|---|
| `creator_id` | uuid | = flows.user_id |
| `total_flows` | bigint | distinct published flows |
| `total_uses` | bigint | consumer runs of their flows |
| `total_credits_earned` | integer | total credits from consumer runs |
| `avg_rating` | numeric | completion-based score (0-5) |

#### `user_roles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `role` | enum `admin\|user` | default `user` |

#### `user_personas`
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `profession` | text | |
| `use_case` | text | |
| `ai_experience` | text | |
| `onboarding_completed` | boolean | |
| `credits_awarded` | boolean | prevents duplicate onboarding bonuses |

### 3.2 Credit System

#### `user_credits`
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | one row per user |
| `balance` | integer | current spendable credits |
| `total_purchased` | integer | lifetime purchased |
| `total_used` | integer | lifetime consumed |

#### `credit_batches`
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `amount` | integer | original batch size |
| `remaining` | integer | currently available |
| `source_type` | text | `subscription` (1-month expiry) or `topup` (12-month expiry) |
| `expires_at` | timestamptz | |
| `reference_id` | text | Stripe session ID or refund reference |

#### `credit_transactions`
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `amount` | integer | positive = credit, negative = debit |
| `type` | text | `purchase`, `topup`, `usage`, `refund`, `expiration`, `subscription_renewal`, `subscription_grant`, `admin_adjustment` |
| `feature` | text | e.g. `flow_run`, `text_to_speech`, `debug` |
| `balance_after` | integer | snapshot after this transaction |
| `reference_id` | text | |

#### `credit_costs`
| Column | Type | Notes |
|---|---|---|
| `feature` | text | `generate_freepik_video`, `generate_freepik_image`, `text_to_speech`, `image`, `video` |
| `model` | text | e.g. `kling-2-6-pro` |
| `duration_seconds` | integer | |
| `has_audio` | boolean | |
| `cost` | integer | credits per operation |
| `pricing_type` | text | `per_operation`, `fixed`, `per_second` |

#### `credit_packages` (Subscription tiers)
| Column | Type | Notes |
|---|---|---|
| `name` | text | e.g. Starter, Basic, Pro, Agency |
| `credits` | integer | monthly allocation |
| `price_thb` | numeric | |
| `stripe_price_id_monthly` | text | |
| `stripe_price_id_annual` | text | |
| `sort_order` | integer | tier ranking |

#### `topup_packages`
| Column | Type | Notes |
|---|---|---|
| `name` | text | |
| `credits` | integer | |
| `price_thb` | numeric | 25% premium over subscription rate |
| `stripe_price_id` | text | |

### 3.3 Flow Studio Tables

#### `flows`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | owner/creator |
| `name` | text | |
| `description` | text | |
| `category` | text | default `general` |
| `status` | text | `draft` or `published` |
| `settings` | jsonb | contains `graph` (nodes + edges JSON) |
| `current_version` | integer | |
| `tags` | text[] | |
| `thumbnail_url` | text | |
| `base_cost` | integer | total API base cost in credits (default 0) |
| `markup_multiplier` | numeric(4,2) | consumer price multiplier (default 2.5) |

#### `flow_nodes`
| Column | Type | Notes |
|---|---|---|
| `flow_id` | uuid FK → flows | |
| `node_type` | text | e.g. `ai/kling_2_6_i2v`, `input/image`, `output/video` |
| `label` | text | |
| `config` | jsonb | node-specific params + connections array |
| `position_x` / `position_y` | float | canvas coordinates |
| `sort_order` | integer | execution order |

#### `flow_runs`
| Column | Type | Notes |
|---|---|---|
| `flow_id` | uuid FK → flows | |
| `user_id` | uuid | |
| `status` | text | `pending`, `running`, `completed`, `failed`, `failed_refunded` |
| `inputs` | jsonb | |
| `outputs` | jsonb | contains `result_url`, `task_id`, `credit_cost` |
| `credits_used` | integer | |
| `error_message` | text | |

#### `flow_versions`
Stores JSON snapshots of flow state for version history.

#### `flow_test_runs`
Per-node test execution records.

### 3.4 Content & Community Tables

- **`community_posts`** — user-shared media with `likes_count`, `comments_count`
- **`community_likes`** / **`community_comments`** — with trigger-based counter sync
- **`user_assets`** — all generated/uploaded files (image, video, audio)
- **`chat_conversations`** / **`chat_messages`** — AI chat history (legacy, retained)

### 3.5 Template System Tables

- **`angle_prompts`** — predefined automation templates with `prompt_template`, `estimated_credits`
- **`angle_prompt_inputs`** — input field definitions per template (image/text/video)
- **`angle_prompt_steps`** — multi-step execution configs with `input_mapping`
- **`presets`** / **`preset_sections`** — categorized prompt presets

### 3.6 Analytics & Admin

- **`analytics_events`** — page views, sessions, UTM tracking
- **`api_usage_logs`** — per-request logging with credits used/refunded
- **`admin_audit_logs`** — admin action tracking
- **`payment_transactions`** — Stripe payment records
- **`rate_limits`** — sliding-window rate limiting (service-role only)

---

## 4. Monetization & Credit Logic

### 4.0 Exchange Rate Standard
- **1 THB = 25 Credits** (all credit values are stored as INTEGER)
- `credit_costs` stores `base_cost` of APIs in credits, not fiat currency

### 4.1 Credit Acquisition
- **Subscription:** Monthly credit allocation via Stripe recurring checkout. Credits expire in 1 month.
- **Top-up:** One-time purchase via Stripe payment checkout. Credits expire in 12 months. Price = subscription rate × 1.25.
- **Formula:** Package credits = `price_thb × 25`

### 4.2 Dual-Sided Monetization (Creator/Consumer Model)

All credit math uses **INTEGER arithmetic** — no floating-point.

#### Condition A — Creator Test Run (caller == flow owner)
```
deduction = Math.ceil(base_cost × 1.1)
transaction_type = "test_run"
```
Creator pays base API cost + 10% platform overhead.

#### Condition B — Consumer Run (caller != flow owner)
```
final_price = Math.ceil(base_cost × markup_multiplier)   // default 2.5×
transaction_type = "consumer_run"
```
Consumer pays the full marked-up price.

#### Condition C — RevShare (triggered by Condition B)
```
rev_share = Math.floor((final_price - base_cost) × 0.20)
transaction_type = "rev_share"  // logged to creator's account
```
Flow owner receives 20% of the margin as a credit batch (30-day expiry).

#### Pre-Auth
Before dispatching any API call, `consume_credits` atomically verifies balance >= deduction. Returns HTTP 402 if insufficient.

### 4.3 Credit Consumption
Handled by DB function `consume_credits(p_user_id, p_amount, ...)`:
1. Acquires advisory lock per user (prevents race conditions)
2. Checks total available across non-expired batches
3. Deducts using **Top-up First, then Subscription**, FIFO by expiry date
4. Updates `user_credits.balance` and logs to `credit_transactions`

### 4.4 Transaction Types
| Type | Description |
|---|---|
| `test_run` | Creator testing their own flow (base × 1.1) |
| `consumer_run` | Consumer running another creator's flow (base × markup) |
| `rev_share` | Revenue share credited to flow owner (20% of margin) |
| `top_up` | One-time credit purchase |
| `purchase` | Subscription credit allocation |
| `refund` | Automatic refund on API failure |
| `expiration` | Expired credit batch zeroed out |

### 4.5 Credit Cost Lookup
Dynamic lookup from `credit_costs` table by `feature` + `model` + `duration_seconds` + `has_audio`. Fallback defaults:
- Image: 104 credits
- Video 5s: 700 credits
- Video 10s: 1,400 credits

### 4.6 Refund on Failure
If an AI provider API call fails after credits are deducted:
1. A new `credit_batch` (source_type=`topup`, 30-day expiry) is created with the refund amount
2. `user_credits.balance` is incremented
3. A `credit_transaction` with type=`refund` is logged
4. `flow_runs.status` is set to `failed_refunded`

### 4.7 Expiration
- **Cron job:** `expire_credit_batches()` runs daily, zeroing expired batches and syncing balances
- **Lazy check:** `trigger_expire_on_credit_read()` fires on `user_credits` SELECT to expire per-user batches on access

---

## 5. Backend Edge Functions

### 5.1 AI Generation

| Function | Method | Auth | Description |
|---|---|---|---|
| `generate-video` | POST | Bearer JWT | Direct Kling API proxy. Accepts `model`, `prompt`, `image_url`, `image_tail_url`, `camera_control`, `duration`, `aspect_ratio`, `negative_prompt`, `cfg_scale`, `video_url` (motion control), `character_orientation`, `keep_original_sound`. Returns `task_id` for polling. Handles camera_control fallback to prompt text for unsupported models. |
| `generate-image` | POST | Bearer JWT | Proxies to Lovable AI Gateway (Gemini 3 Pro Image). Accepts `prompt`, `model` (`nano-banana-pro` or `nano-banana`), `reference_image_url`, `edit_instruction`. Uploads base64 result to `ai-media` storage bucket. Returns `image_url`. |
| `text-to-speech` | POST | Bearer JWT | Google AI Studio Gemini TTS. Accepts `text` (max 5000 chars), `voice` (Aoede/Charon/Fenrir/Kore/Puck/Leda/Orus/Zephyr). Converts PCM→WAV, uploads to `user_assets` storage. Rate limited 15/min. Auto-refunds on failure. |

### 5.2 Flow Execution

| Function | Method | Auth | Description |
|---|---|---|---|
| `run-flow-init` | POST | Bearer JWT | **Dispatcher** for Flow Studio canvas nodes. Accepts `flow_id`, `node_type`, `params`. Routes to provider based on `NODE_TYPE_REGISTRY` (klingVideoNode→kling, bananaProNode→banana, etc.). Deducts credits upfront via `consume_credits`. Creates `flow_runs` record. Refunds on API failure. Supports `simulate_failure` flag for testing. |
| `run-flow` | POST | Bearer JWT | **Sequential executor** for multi-node published flows. Fetches `flow_nodes`, topologically sorts them, executes each node in order. Supports node types: `input/*`, `ai/image_gen`, `ai/kling_*`, `ai/voice_gen`, `ai/text_gen`, `transform/prompt_builder`, `output/*`. Polls Kling tasks to completion (5-min timeout). |
| `run-flow-status` | POST | Bearer JWT | Polls Kling task status by `task_id`. Updates `flow_runs` on completion/failure. Auto-refunds on failure if `credit_cost` is provided. |

### 5.3 Payments (Stripe)

| Function | Method | Auth | Description |
|---|---|---|---|
| `create-checkout` | POST | Bearer JWT | Creates Stripe Checkout Session for subscriptions. Accepts `packageId`, `billingInterval` (`monthly`/`annual`), `embedded`. Sets `client_reference_id` to user's Auth UUID. Handles upgrade path (cancels old subscription). Validates/creates Stripe customer. |
| `create-topup` | POST | Bearer JWT | Creates Stripe Checkout Session for one-time top-up. Accepts `packageId`, `embedded`. Mode: `payment`. |
| `stripe-webhook` | POST | Stripe sig | Handles `checkout.session.completed` (subscription + topup), `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` (renewal). Subscription grants use type `subscription_grant`; renewals use `subscription_renewal`. User identified via `metadata.user_id` with `client_reference_id` fallback. Creates credit batches, updates profiles. |
| `customer-portal` | POST | Bearer JWT | Creates Stripe Billing Portal session. Validates/recovers `stripe_customer_id`. |
| `get-stripe-key` | POST | Bearer JWT | Returns `STRIPE_PUBLISHABLE_KEY` to authenticated users. |

### 5.4 Utility

| Function | Method | Auth | Description |
|---|---|---|---|
| `freepik-stock` | POST | Bearer JWT | Proxies Freepik API for Stock Library. Actions: `search-resources`, `search-videos`, `download-resource`, `download-video`. Logs downloads to `stock_downloads`. |
| `test-refund-flow` | POST | Bearer JWT | Debug: simulates deduct→fail→refund cycle. Verifies net-zero credit integrity. |

---

## 6. Node System (ComfyUI-Style)

### 6.1 Architecture

The node system is defined in `src/components/flow/nodes/nodeApiSchema.ts` as a **Single Source of Truth** (`NODE_API_SCHEMA`). Each entry defines:

```typescript
interface NodeApiDef {
  displayName: string;        // UI label
  category: "AI PROCESS";
  accentColor: string;        // Tailwind color token
  supportedModels: string[];  // Exact API model_name values
  defaultModel: string;
  inputs: NodeIOHandle[];     // { id, label, color, required? }
  outputs: NodeIOHandle[];
  params: ParamDef[];         // Ordered, API-exact keys
}
```

### 6.2 Current Node Types in Schema

#### `motionControlNode`
- **Display:** "Motion Control"
- **Models:** `kling-v2-6` only
- **Inputs:** `ref_image` (required), `ref_video` (required)
- **Outputs:** `VIDEO`
- **Params:** `model_name`, `mode` (pro/std), `character_orientation` (video/image), `prompt`, `negative_prompt`, `cfg_scale` (0–1), `aspect_ratio`, `duration` (5/10), `keep_original_sound`

#### `klingVideoNode`
- **Display:** "Kling I2V"
- **Models:** `kling-v2-6`, `kling-v3`, `kling-v2-1`, `kling-v2`, `kling-v2-5`, `kling-v1-6`, `kling-v1-5`, `kling-v1`
- **Inputs:** `start_frame` (required), `end_frame` (optional)
- **Outputs:** `VIDEO`
- **Params:** `model_name`, `mode` (pro/std), `prompt`, `negative_prompt`, `cfg_scale` (0–1), `aspect_ratio`, `duration` (5/10)
- **Camera Controls** (group: "Camera Controls", models `kling-v1` through `kling-v2-6` only, NOT `kling-v3`):
  - `camera_zoom` (slider -10 to 10)
  - `camera_pan` (slider -10 to 10)
  - `camera_tilt` (slider -10 to 10)
  - `camera_roll` (slider -10 to 10)

### 6.3 Strict Schema Enforcement

**⚠️ Zero-Trust API Schema Policy:**
- No model names, parameters, or features are added without explicit confirmation from official API docs.
- `getVisibleParams(nodeType, model)` filters params by `supportedModels` array.
- `sanitizeNodePayload()` strips null/empty/unsupported params and compiles `camera_*` sliders into `camera_control` JSON:
  ```json
  { "type": "simple", "config": { "horizontal": pan, "vertical": tilt, "zoom": zoom, "roll": roll, "pan": pan, "tilt": tilt } }
  ```
- `cleanParamsOnModelChange()` removes orphaned params when switching models and resets invalid select values.
- `getParamOptions()` supports per-model option overrides via `optionsPerModel`.

### 6.4 UI Components

| Component | Purpose |
|---|---|
| `KlingVideoNode.tsx` | React Flow node for Kling I2V. Renders schema-driven params with group headers. |
| `MotionControlNode.tsx` | React Flow node for Motion Control. |
| `NodeParamRenderer.tsx` | Shared param renderer: textarea, select, slider, json, text. Includes expose/hide toggle for PlayFlow. |
| `NodeConfigPanel.tsx` | Side panel for detailed node config. |
| `NodePalette.tsx` | Drag-and-drop palette of available nodes. |

### 6.5 Other Node Components (not schema-driven)

| Component | Purpose |
|---|---|
| `InputNode.tsx` | User input nodes (image/text/video upload) |
| `OutputNode.tsx` | Final output display |
| `BananaProNode.tsx` | Image generation node (Banana Pro / Gemini) |
| `KlingExtensionNode.tsx` | Video extension node |

---

## 7. Frontend Routing

```
/                           → Landing page
/auth                       → Login/Signup
/reset-password             → Password reset
/explore                    → Public flow gallery (protected)
/play/:flowId               → Consumer mode — run a published flow
/dashboard/                 → Protected dashboard layout
  home                      → Dashboard home
  flow-studio               → Flow list/management
  flow-studio/:flowId       → Full-screen Flow Studio editor
  community                 → Community gallery
  stock                     → Stock Library (Freepik)
  assets                    → User asset manager
  pricing                   → Subscription & top-up packages
  settings                  → Profile & preferences
  transactions              → Credit transaction history
  history                   → Generation history
  analytics                 → Usage analytics (admin)
  admin                     → Admin panel
  template/:templateId      → Angle prompt template execution
/dev/debug                  → Developer debug tools
```

---

## 8. Authentication

- **Providers:** Email/Password + Google OAuth (managed via Lovable)
- **Auto-confirm:** Disabled (email verification required)
- **Profile creation:** Automatic via `handle_new_user()` trigger on `auth.users` INSERT
- **Role system:** `user_roles` table with `has_role()` function for admin checks
- **Session:** Managed via `AuthContext` with `ProtectedRoute` wrapper

---

## 9. Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `ai-media` | Yes | Generated images (base64→upload) |
| `user_assets` | No | TTS audio, user uploads |
| `videos` | No | Generated videos |
| `preset-thumbnails` | Yes | Template preview images |
| `angle-prompt-media` | Yes | Angle prompt examples |

---

## 10. Secrets (Environment)

| Secret | Used By |
|---|---|
| `KLING_ACCESS_KEY_ID` | generate-video, run-flow-init, run-flow, run-flow-status |
| `KLING_SECRET_KEY` | Same as above (JWT signing) |
| `LOVABLE_API_KEY` | generate-image, run-flow (text gen) |
| `GOOGLE_AI_STUDIO_KEY` | text-to-speech |
| `STRIPE_SECRET_KEY` | create-checkout, create-topup, stripe-webhook, customer-portal |
| `STRIPE_PUBLISHABLE_KEY` | get-stripe-key |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook (signature validation) |
| `FREEPIK_API_KEY` | freepik-stock |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | All edge functions |

---

## 12. Design System — "Midnight Neon" Color Reference

> **Theme:** Dark-only. No light mode. All values are HSL (used in CSS variables and Tailwind).

### 12.1 Core Palette (CSS Variables in `index.css`)

| Token | HSL Value | Hex Approx. | Purpose |
|---|---|---|---|
| `--background` | `226 47% 7%` | `#0a0e1a` | Global page background — deep navy |
| `--foreground` | `210 40% 98%` | `#f1f5f9` | Primary text color — near-white |
| `--card` | `222 47% 11%` | `#141827` | Card/panel surfaces |
| `--card-foreground` | `210 40% 98%` | `#f1f5f9` | Text on cards |
| `--popover` | `222 47% 11%` | `#141827` | Dropdown/popover surfaces |
| `--popover-foreground` | `210 40% 98%` | `#f1f5f9` | Text in popovers |
| `--primary` | `262.1 83.3% 57.8%` | `#7c3aed` | Electric purple — buttons, links, focus rings |
| `--primary-foreground` | `210 40% 98%` | `#f1f5f9` | Text on primary-colored surfaces |
| `--secondary` | `217.2 32.6% 17.5%` | `#1e293b` | Subtle container backgrounds, hover states |
| `--secondary-foreground` | `210 40% 98%` | `#f1f5f9` | Text on secondary surfaces |
| `--muted` | `217.2 32.6% 17.5%` | `#1e293b` | Muted/disabled backgrounds |
| `--muted-foreground` | `215 20.2% 65.1%` | `#94a3b8` | Secondary/helper text — light slate |
| `--accent` | `283 55% 60%` | `#b460d9` | Magenta-purple accent — badges, highlights |
| `--accent-foreground` | `210 40% 98%` | `#f1f5f9` | Text on accent surfaces |
| `--destructive` | `0 84% 60%` | `#ef4444` | Error states, destructive actions |
| `--destructive-foreground` | `210 40% 98%` | `#f1f5f9` | Text on destructive surfaces |
| `--border` | `217.2 32.6% 17.5%` | `#1e293b` | Borders — subtle, low-contrast |
| `--input` | `217.2 32.6% 17.5%` | `#1e293b` | Input field borders |
| `--ring` | `262.1 83.3% 57.8%` | `#7c3aed` | Focus ring color (matches primary) |

### 12.2 Sidebar Variables

| Token | HSL Value | Purpose |
|---|---|---|
| `--sidebar-background` | `226 47% 9%` | Sidebar background (slightly lighter than page) |
| `--sidebar-foreground` | `210 40% 93%` | Sidebar text |
| `--sidebar-primary` | `262.1 83.3% 57.8%` | Active item accent |
| `--sidebar-accent` | `283 55% 65%` | Sidebar highlight |
| `--sidebar-border` | `217.2 32.6% 17.5%` | Sidebar dividers |

### 12.3 Gradient Tokens

| Token | Value | Purpose |
|---|---|---|
| `--gradient-primary` | `linear-gradient(135deg, hsl(262 83% 58%), hsl(283 47% 45%))` | Primary gradient — buttons, hero elements |
| `--gradient-subtle` | `linear-gradient(135deg, hsl(226 47% 9%), hsl(222 47% 13%))` | Subtle background gradient |
| `.gradient-primary` | `hsl(262 83% 58%) → hsl(283 47% 55%)` | Utility class for primary gradient bg |
| `.gradient-text` | `hsl(262 83% 65%) → hsl(283 47% 60%)` | Gradient text (background-clip) |

### 12.4 Hardcoded Colors (Used Sparingly)

| Color | Where Used | Purpose |
|---|---|---|
| `#060a12` | CreatorLayout sidebar `bg-[#060a12]/90` | Sidebar — darker than `--background` for depth |
| `border-white/[0.04]` | CreatorLayout borders | Ultra-subtle white borders on dark sidebar |
| `text-emerald-400`, `bg-emerald-500/5` | PlayFlow, Settings | Positive states (balance OK, ready status) |
| `text-red-400`, `border-red-500/15` | PlayFlow, forms | Insufficient credits, errors |
| `text-slate-100/200/300/400/500/600` | CreatorLayout nav | Sidebar text hierarchy (active → inactive) |

### 12.5 InteractiveBackground Blob Colors

| Blob | HSL | Position | Size | Opacity |
|---|---|---|---|---|
| Primary purple | `257 61% 47%` | Top-right | 700px | 40% |
| Magenta | `283 47% 45%` | Bottom-left | 600px | 35% |
| Violet | `257 61% 55%` | Center | 450px | 25% |
| Deep blue-purple | `260 50% 35%` | Top-left | 500px | 30% |
| Pink accent | `300 50% 50%` | Bottom-right | 350px | 20% |

### 12.6 Glow & Shadow Effects

| Class | Effect | Purpose |
|---|---|---|
| `.glow` | `box-shadow: 0 0 40px primary/0.3, 0 0 80px accent/0.2` | Strong neon glow for hero elements |
| `.glow-subtle` | `box-shadow: 0 0 20px primary/0.15, 0 0 40px accent/0.1` | Subtle glow for cards |
| `.tech-card:hover` | `border-color: hsl(257 61% 47% / 0.4) + box-shadow` | Tech card hover glow effect |

### 12.7 Background Layering Pattern

All layouts follow this pattern to show animated blobs through UI:

```tsx
// ✅ Correct — fixed background layer with isolate
<div className="min-h-screen relative isolate">
  <div className="fixed inset-0 -z-10">
    <InteractiveBackground />
  </div>
  {/* Content with semi-transparent panels */}
  <div className="bg-card/80 backdrop-blur-xl">...</div>
</div>
```

**Key rules:**
- Root wrapper: `relative isolate` (NO `bg-background` — it occludes the blobs)
- Background: `fixed inset-0 -z-10` wrapper around `<InteractiveBackground />`
- Content panels: Use `bg-card/80`, `bg-secondary/60`, etc. with `backdrop-blur-xl`
- Headers: `bg-background/80 backdrop-blur-2xl` (semi-transparent)
- Sidebar (Creator): `bg-[#060a12]/90 backdrop-blur-xl`

### 12.8 Button Design ("Transparent 3D")

All buttons follow the glassmorphism Midnight Neon style:
- **Default:** Semi-transparent backgrounds with `backdrop-blur-xl`
- **Depth:** Inset shadows for 3D effect
- **Hover:** Purple neon glow + slight scale (`hover:scale-[1.015]`)
- **Active:** Press effect via `active:scale-[0.97]`
- **CTA gradient variant:** `bg-gradient-to-r from-[hsl(262_70%_42%)] to-[hsl(238_55%_50%)]` with shimmer animation

---

## 11. Known Issues / Technical Debt

1. ~~**`generate-video` still contains `kling-v3-omni` entries**~~ — **RESOLVED** (purged 2026-02-22)
2. ~~**Duplicate Kling JWT generation**~~ — **RESOLVED** (acknowledged as acceptable duplication for edge function isolation)
3. ~~**`run-flow-init` and `run-flow` overlap**~~ — **RESOLVED** (intentional dual-path architecture: `run-flow-init` for single-node canvas testing, `run-flow` for multi-node published execution)
4. ~~**Camera control only confirmed working for `kling-v1-std`**~~ — **RESOLVED** (prompt-text fallback implemented for unsupported models; native support confirmed for v1-std)
5. ~~**`credit_costs` feature naming inconsistency**~~ — **RESOLVED** (standardized to `generate_freepik_video`/`generate_freepik_image` 2026-02-22)
6. ~~**`flows.base_cost` not auto-calculated**~~ — **RESOLVED** (creator-set pricing is intentional; `base_cost` + `markup_multiplier` give creators control over consumer pricing)
