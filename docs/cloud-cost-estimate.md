# Complete Cloud Cost Analysis — MediaForge

> Estimated: 2026-04-16
> Stack: Vercel (Frontend) + Supabase Cloud (Backend)
> Based on: Live network analysis of mediaforge.co + codebase audit

---

## 1. FRONTEND HOSTING (Vercel)

### Build Profile

| Metric | Value |
|---|---|
| Build output | **148 MB** total (169 files) |
| JS chunks | **101 files** (code-split, lazy-loaded) |
| CSS | **2 files** |
| Main bundle (gzipped) | ~321 KB (`index-BBqLZhdW.js`) |
| Largest chunk | `LoadingModel3D` — 886 KB (241 KB gzip) |
| Total JS gzipped | ~349 KB initial load |

### Bandwidth Per Visit (measured from network)

| Visit type | Transfer size |
|---|---|
| First visit (cold cache) | **~3.1 MB** |
| Return visit (cached JS/CSS) | **~0.6 MB** (only API + images) |
| Full scroll /explore page | **~16.5 MB** (video thumbnails dominate) |

### Vercel Pricing

| Plan | Price | Bandwidth | Builds | Best for |
|---|---|---|---|---|
| **Hobby** | **$0/mo** | 100 GB/mo | 6,000 min/mo | <1K DAU, solo dev |
| **Pro** | **$20/mo/member** | 1 TB/mo | 24,000 min/mo | Team, custom domain, analytics |
| **Enterprise** | Custom | Custom | Custom | SLA, SSO |

### Vercel Bandwidth Estimate

| DAU | Avg transfer/visit | Monthly bandwidth | Plan needed |
|---|---|---|---|
| 100 | ~5 MB | **15 GB** | Hobby ($0) |
| 500 | ~5 MB | **75 GB** | Hobby ($0) |
| 1,000 | ~5 MB | **150 GB** | Pro ($20) |
| 5,000 | ~5 MB | **750 GB** | Pro ($20) |
| 10,000 | ~5 MB | **1.5 TB** | Pro + $40 overage ($60) |

> Note: Currently hosted on **Lovable** (free hosting with Lovable subscription). Moving to Vercel adds this cost.

---

## 2. SUPABASE CLOUD (Backend)

### Database Profile

| Metric | Value |
|---|---|
| Migrations | **103** files (364 KB SQL) |
| Tables (CREATE TABLE) | **~53** |
| RLS Policies | **~282** statements |
| Indexes | **~45** |
| DB Functions/RPCs | **~37** |
| pg_cron jobs | **2** (credit expiry cleanup, analytics cleanup) |

### Storage Buckets (7 total)

| Bucket | Purpose | Growth rate | Public |
|---|---|---|---|
| `ai-media` | AI-generated images/videos | **High** — grows with every generation | Yes |
| `preset-thumbnails` | Flow card thumbnails (JPG + MP4) | Medium — grows with new flows | Yes |
| `user_assets` | User avatars/uploads | Low | Private |
| `flow-assets` | Flow node assets | Low-Medium | Yes |
| `videos` | Video uploads | Medium | Yes |
| `angle-prompt-media` | Angle prompt references | Low | Yes |
| `landing-videos` | Marketing/landing page videos | Static | Yes |

### Realtime Channels (3 active)

| Channel | Purpose |
|---|---|
| `credit_costs-realtime` | Live credit cost updates |
| `online-users` | Presence tracking |
| `notifications-realtime` | Push notifications |

### Edge Functions (21 total)

| Function | External API | Execution time | Frequency |
|---|---|---|---|
| `run-flow-init` | Kling AI, Google AI | **Long** (10-60s, waits for AI) | Per generation |
| `run-flow` | Kling AI, Google AI | **Long** (multi-node) | Per generation |
| `execute-pipeline-step` | Kling AI, Google AI | **Long** | Per pipeline step |
| `run-flow-status` | — (DB poll) | Short | Polling (every 7s) |
| `generate-video` | Kling AI | **Long** (video gen) | Per video request |
| `text-to-speech` | Google AI | Medium | Per TTS request |
| `generate-embedding` | Google AI | Short | Per flow submission |
| `freepik-stock` | Freepik API | Short | Per stock search |
| `create-checkout` | Stripe | Short | Per purchase |
| `create-topup` | Stripe | Short | Per top-up |
| `stripe-webhook` | — (incoming) | Short | Per Stripe event |
| `customer-portal` | Stripe | Short | Per portal visit |
| `get-stripe-key` | — | Instant | Per pricing page |
| `admin-login` | — | Short | Per admin login |
| `admin-api` | — | Short | Per admin action |
| `submit-flow-for-review` | — | Short | Per submission |
| `submit-flow-review` | — | Short | Per review |
| `quote-flow` | — | Short | Per flow preview |
| `backfill-embeddings` | Google AI | Long (batch) | Manual/one-time |
| `test-refund-flow` | — | Short | Dev only |

### Supabase API Requests Per User Session (measured)

| User behavior | REST API | Storage renders (img) | Storage objects (video) | **Total** |
|---|---|---|---|---|
| Lands on /explore, no scroll | 18 | 12 | 0 | **30** |
| Scrolls halfway | 18 | ~25 | ~35 | **~78** |
| Full scroll to bottom | 18 | **40** | **77** | **135** |
| + Runs a flow (generation) | +3-5 | +1-2 | +0 | +5-7 |
| + Polls status (per poll) | +1 | 0 | 0 | +1 |

### Supabase Pricing

| Plan | Price | Database | Storage | Bandwidth | Edge Invocations | Auth MAU | Realtime |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | 500 MB | 1 GB | 2 GB | 500K | 50K | 200 concurrent |
| **Pro** | **$25/mo** | 8 GB | 100 GB | 250 GB | 2M | 100K | 500 concurrent |
| **Team** | $599/mo | 8 GB | 100 GB | 250 GB | 2M | 100K | — |

### Pro Plan Overage Rates

| Resource | Overage cost |
|---|---|
| Database | $0.125/GB |
| Storage | $0.021/GB |
| Bandwidth | **$0.09/GB** |
| Edge invocations | $2/100K |
| Auth MAU | $0.00325/MAU |
| Image transforms | $5/1,000 origin images |
| Realtime messages | $2.50/million |

### Monthly Supabase Estimate by Scenario

#### 100 DAU (MVP)

| Resource | Usage | Cost |
|---|---|---|
| Base Pro plan | — | $25.00 |
| Database | ~200 MB | $0 (included) |
| Storage | ~5 GB (ai-media grows) | $0 (included) |
| Bandwidth | 100 x 78 req x 30d x ~5KB avg = ~11 GB | $0 (included) |
| Edge invocations | ~500/mo | $0 (included) |
| Auth MAU | ~100 | $0 (included) |
| Image transforms | ~36,000 renders | ~$0 (within limits) |
| Realtime | ~100 concurrent peak | $0 (included) |
| **Subtotal** | | **$25/mo** |

#### 500 DAU (Growing)

| Resource | Usage | Cost |
|---|---|---|
| Base Pro plan | — | $25.00 |
| Database | ~500 MB | $0 |
| Storage | ~20 GB | $0 (included) |
| Bandwidth | ~55 GB | $0 (included) |
| Edge invocations | ~5,000/mo | $0 |
| Auth MAU | ~2,000 | $0 |
| Image transforms | ~180,000 renders | ~$5-10 |
| Realtime | ~200 concurrent | $0 |
| **Subtotal** | | **~$30-35/mo** |

#### 1K DAU (Active)

| Resource | Usage | Cost |
|---|---|---|
| Base Pro plan | — | $25.00 |
| Database | ~1 GB | $0 |
| Storage | ~50 GB (ai-media accumulating) | $0 |
| Bandwidth | ~110 GB | $0 (included) |
| Edge invocations | ~15,000/mo | $0 |
| Auth MAU | ~5,000 | $0 |
| Image transforms | ~360,000 renders | ~$15 |
| Video thumb bandwidth | ~300 GB (77 vid reqs x 500KB x 1K x 30) | **$4.50** overage |
| Realtime | ~500 concurrent | $0 |
| **Subtotal** | | **~$45-50/mo** |

#### 5K DAU (Scale)

| Resource | Usage | Cost |
|---|---|---|
| Base Pro plan | — | $25.00 |
| Database | ~4 GB | $0 |
| Storage | ~200 GB | **$2.10** overage |
| Bandwidth | ~1.5 TB | **$112.50** overage |
| Edge invocations | ~75,000/mo | $0 |
| Auth MAU | ~20,000 | $0 |
| Image transforms | ~1.8M renders | ~$50 |
| Realtime | ~2,000 concurrent | ~$5 |
| **Subtotal** | | **~$195/mo** |

---

## 3. EXTERNAL API COSTS (Pass-through, billed separately)

| Service | Usage | Pricing model | Estimated cost |
|---|---|---|---|
| **Kling AI** | Image/video generation | Per API call (~$0.01-0.10/gen) | Scales with usage |
| **Google AI Studio** | Gemini (text/embedding), TTS | Free tier generous, then pay-per-token | ~$0 early, $5-50/mo at scale |
| **Freepik API** | Stock image search | Subscription-based | ~$10-30/mo |
| **Stripe** | Payment processing | 2.9% + $0.30 per transaction | Scales with revenue |
| **PostHog** | Analytics (frontend + backend events) | Free up to 1M events/mo | $0 (most cases) |

> These costs are covered by the credit pricing model: `sellingPrice = apiCost x 4.0` (4x markup). Users pay via credits, so external API costs are revenue-funded, not infrastructure costs.

---

## 4. DOMAIN & DNS

| Service | Cost |
|---|---|
| Domain (`mediaforge.co`) | ~$12-15/year |
| DNS (Cloudflare/Vercel) | $0 |

---

## 5. TOTAL MONTHLY COST SUMMARY

| Scenario | Vercel | Supabase | External APIs | Domain | **Grand Total** |
|---|---|---|---|---|---|
| **MVP** (100 DAU) | $0 | $25 | ~$5 | ~$1 | **~$31/mo** |
| **Growing** (500 DAU) | $0 | ~$33 | ~$20 | ~$1 | **~$54/mo** |
| **Active** (1K DAU) | $20 | ~$48 | ~$50 | ~$1 | **~$119/mo** |
| **Scale** (5K DAU) | $20 | ~$195 | ~$200 | ~$1 | **~$416/mo** |
| **High Scale** (10K DAU) | $60 | ~$400 | ~$500 | ~$1 | **~$961/mo** |

---

## 6. COST OPTIMIZATION RECOMMENDATIONS (Priority Order)

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Video .mp4 thumbnails from Supabase Storage** cause 503s + retries (77 requests/session) | ~60% of Supabase bandwidth cost | Convert to static JPG posters, or serve via Cloudflare R2 (free egress) |
| 2 | **Duplicate API calls** — `profiles_public` fetched 3-4x, `flows` queried with overlapping filters | ~30% unnecessary REST calls | Deduplicate with React Query keys, batch profile lookups |
| 3 | **Image transforms billed per origin** | $5/1K origins, adds up | Add CDN cache headers, use Vercel Image Optimization as proxy |
| 4 | **`ai-media` bucket grows unbounded** | Storage cost scales linearly forever | Add TTL/cleanup policy for old generations, or move to R2 |
| 5 | **Hero video 1.5 MB on every cold visit** | Bandwidth cost | Serve from CDN, add aggressive cache headers |
| 6 | **No pagination limit** on /explore — loads ALL 84 flows | Over-fetches for most users | Cap at 3-4 pages, add explicit "Load more" button |
| 7 | **Status polling every 7s** during generation | Edge function invocations during AI gen | Switch to Supabase Realtime for status updates |

---

## 7. INFRASTRUCTURE INVENTORY

### Codebase Stats
- **Frontend:** React 18 + TypeScript + Vite, 25+ routes (lazy-loaded)
- **UI:** shadcn/ui + Radix + Tailwind CSS ("Midnight Neon" dark theme)
- **State:** React Query + Context (AuthContext, LanguageContext)
- **Auth:** Email + Google OAuth via Supabase Auth

### Network Request Pattern (Home/Explore page)
- 18 Supabase REST API calls on initial load
- 7 distinct tables queried: `flows`, `flow_categories`, `homepage_sections`, `homepage_featured`, `profiles_public`, `profiles`, `flow_metrics`
- Infinite scroll pagination: 12 items/page, up to 7 pages loaded (84 flows)
- 40 image transform renders + 77 video object fetches per full scroll
- 5-6 static videos from `/videos/mobile/` directory

### External Service Integration Count
- Kling AI: 49 references in edge functions
- Stripe: 30 references
- Google AI: 29 references
- PostHog: 9 references
- Freepik: 8 references
