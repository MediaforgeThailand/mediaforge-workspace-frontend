# MediaForge — Admin Panel Technical Documentation

> Complete reference for the Admin Panel governance system.  
> Intended audience: AI agents, developers, and system architects.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication System](#2-authentication-system)
3. [Role-Based Access Control](#3-role-based-access-control)
4. [Database Schema](#4-database-schema)
5. [Edge Functions](#5-edge-functions)
6. [Flow Lifecycle & Status Machine](#6-flow-lifecycle--status-machine)
7. [Pricing Engine](#7-pricing-engine)
8. [Scoring Rubric](#8-scoring-rubric)
9. [UI Components & Pages](#9-ui-components--pages)
10. [Notification System](#10-notification-system)
11. [Configuration](#11-configuration)

---

## 1. Overview

The Admin Panel is a **fully isolated governance layer** for the MediaForge flow marketplace. It handles:

- **Flow review & approval** — multi-stage pipeline with scoring rubric
- **Tiered pricing & revenue sharing** — automatic calculation based on quality tier
- **Admin account management** — separate from consumer/creator auth
- **Content moderation** — read-only flow canvas inspection, badges, unpublishing

### Key Isolation Principles

| Aspect | Consumer/Creator | Admin |
|--------|-----------------|-------|
| Auth table | `auth.users` (Supabase Auth) | `admin_accounts` (custom table) |
| JWT issuer | Supabase | Custom HMAC SHA-256 |
| Session storage | Supabase session | `sessionStorage` (browser) |
| Route prefix | `/app/*`, `/creator/*` | `/admin/*` |
| Context | `AuthContext` | `AdminAuthContext` |
| Protected route | `ProtectedRoute` | `AdminProtectedRoute` |

---

## 2. Authentication System

### 2.1 `admin_accounts` Table

Completely separate from `auth.users`. No foreign key to Supabase Auth.

```sql
CREATE TABLE admin_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,          -- PBKDF2-SHA256, format: base64(salt):base64(hash)
  display_name  text NOT NULL,
  admin_role    text NOT NULL DEFAULT 'review_admin',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES admin_accounts(id)
);
```

**RLS**: `false` for all operations (no public access). All mutations go through Edge Functions using `SUPABASE_SERVICE_ROLE_KEY`.

### 2.2 Password Hashing

Algorithm: **PBKDF2** with SHA-256, 100,000 iterations, 16-byte random salt.

Storage format: `base64(salt):base64(derivedKey)` — both 256-bit.

```typescript
// Hashing (in admin-login edge function)
const salt = crypto.getRandomValues(new Uint8Array(16));
const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, km, 256
);
const stored = btoa(String.fromCharCode(...salt)) + ":" + btoa(String.fromCharCode(...new Uint8Array(bits)));
```

### 2.3 JWT Structure

Signed with `JWT_SECRET` env var using HMAC SHA-256. Expires in **1 hour**.

```json
{
  "sub": "<admin_account_id>",
  "email": "admin@mediaforge.com",
  "role": "super_admin",
  "display_name": "admin",
  "type": "admin",
  "iat": 1700000000,
  "exp": 1700003600
}
```

The `type: "admin"` claim distinguishes admin JWTs from Supabase user JWTs.

### 2.4 Client-Side Auth Flow

**File**: `src/contexts/AdminAuthContext.tsx`

1. On mount, reads `admin_token` from `sessionStorage`
2. Parses JWT payload (base64), checks `type === "admin"` and `exp`
3. If valid, populates `admin` state (`AdminAccount` type)
4. `login()` calls `admin-login` edge function, stores returned JWT
5. `logout()` clears `sessionStorage` and resets state
6. `adminFetch(action, params)` — convenience wrapper that sends authenticated POST to `admin-api`

**File**: `src/components/admin/AdminProtectedRoute.tsx`

- Reads `admin` and `loading` from `AdminAuthContext`
- Shows spinner while loading
- Redirects to `/admin/login` if no admin session

### 2.5 Admin Login Edge Function Actions

**Endpoint**: `POST /functions/v1/admin-login`  
**Config**: `verify_jwt = false` (no Supabase JWT required)

| Action | Purpose | Required Fields | Who Can Call |
|--------|---------|----------------|-------------|
| *(none/login)* | Normal login | `email`, `password` | Anyone |
| `seed` | Create first super_admin (only if 0 admins exist) | `email`, `password` | Anyone (one-time) |
| `reseed` | Update or create admin account (upsert) | `email`, `password` | Anyone |
| `force_reset` | Reset password for existing admin | `email`, `password` | Anyone |

**Login response**:
```json
{
  "token": "<jwt_string>",
  "admin": {
    "id": "uuid",
    "email": "admin@mediaforge.com",
    "role": "super_admin",
    "display_name": "admin"
  }
}
```

---

## 3. Role-Based Access Control

### 3.1 Admin Roles

| Role | Scope |
|------|-------|
| `super_admin` | Full access — can create/manage other admin accounts |
| `review_admin` | Flow review, scoring, approve/reject |
| `finance_admin` | Revenue and payout visibility |
| `ops_admin` | Operational management |

### 3.2 Super Admin Gates

These `admin-api` actions are restricted to `super_admin` only:

- `create_admin` — create a new admin account
- `list_admins` — list all admin accounts
- `toggle_admin_active` — enable/disable an admin account

All other actions (review, dashboard, flow management) are available to any authenticated admin.

---

## 4. Database Schema

### 4.1 `admin_accounts`

See [Section 2.1](#21-admin_accounts-table).

### 4.2 `flow_reviews`

Stores review scores and decisions for each flow submission.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | `gen_random_uuid()` | Primary key |
| `flow_id` | uuid | — | FK → `flows.id` ON DELETE CASCADE |
| `reviewer_id` | uuid | — | FK → `admin_accounts.id` |
| `output_quality` | integer | 0 | Score 0-5 |
| `consistency` | integer | 0 | Score 0-5 |
| `commercial_usability` | integer | 0 | Score 0-5 |
| `originality` | integer | 0 | Score 0-5 |
| `efficiency` | integer | 0 | Score 0-5 |
| `workflow_clarity` | integer | 0 | Score 0-5 |
| `safety` | integer | 0 | Score 0-5 |
| `total_score` | integer | null | Sum of all 7 scores (calculated server-side) |
| `suggested_tier` | text | null | Auto-suggested tier from score |
| `assigned_tier` | text | null | Admin-overridden tier |
| `decision` | text | `'pending'` | `pending`, `approved`, `rejected`, `changes_requested` |
| `reviewer_notes` | text | null | Visible to creator |
| `internal_notes` | text | null | Admin-only notes |
| `created_at` | timestamptz | `now()` | Review timestamp |

**RLS Policies**:
- `No public access` (ALL → `false`)
- `Creators can view own flow reviews` (SELECT → flow owner check)

All writes go through `admin-api` using service role key.

### 4.3 `flow_badges`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `flow_id` | uuid | FK → `flows.id` |
| `badge` | text | `'official_flow'`, `'top_performing'`, `'enterprise_ready'` |
| `assigned_by` | uuid | Admin who assigned |
| `created_at` | timestamptz | — |

UNIQUE constraint: `(flow_id, badge)`.

**RLS**: Public read for published flows; no public write.

### 4.4 `flow_metrics`

| Column | Type | Description |
|--------|------|-------------|
| `flow_id` | uuid | PK, FK → `flows.id` |
| `total_runs` | integer | Aggregate run count |
| `total_revenue` | integer | Total credits earned |
| `avg_rating` | numeric | Average user rating |
| `last_run_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

**RLS**: Public read for published flows; no public write.

### 4.5 `flows` Table — Admin-Relevant Columns

These columns were added to support the governance system:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `tier` | text | `'standard'` | `standard`, `pro`, `masterpiece` |
| `status` | text | `'draft'` | See [Section 6](#6-flow-lifecycle--status-machine) |
| `api_cost` | integer | 0 | Base API cost in credits |
| `selling_price` | integer | 0 | Final price to consumers |
| `contribution_margin` | integer | 0 | `selling_price - api_cost` |
| `creator_payout` | integer | 0 | Creator's revenue share |
| `markup_multiplier` | numeric | 2.5 | Tier-based multiplier |
| `performance_bonus_percent` | numeric | 0 | Future performance bonus |
| `is_official` | boolean | false | Platform-official flag |

---

## 5. Edge Functions

### 5.1 `admin-login`

**Path**: `supabase/functions/admin-login/index.ts`  
**Config**: `verify_jwt = false`  
**Auth**: None required (handles its own auth)

See [Section 2.5](#25-admin-login-edge-function-actions) for actions.

### 5.2 `admin-api`

**Path**: `supabase/functions/admin-api/index.ts`  
**Config**: `verify_jwt = false`  
**Auth**: Custom admin JWT verified server-side via HMAC SHA-256

All requests are `POST` with JSON body containing `action` field.

#### Action Reference

| # | Action | Parameters | Response | Role Gate |
|---|--------|-----------|----------|-----------|
| 1 | `get_dashboard_stats` | — | `{ statusCounts, pendingReviews, totalRevenue, totalFlows }` | Any admin |
| 2 | `get_review_queue` | `status?`, `tier?`, `page?`, `limit?`, `include_published?` | `{ flows: [...] }` | Any admin |
| 3 | `get_flow_detail` | `flow_id` | `{ flow, nodes, reviews, badges }` | Any admin |
| 4 | `submit_review` | `flow_id`, `decision`, scores×7, `assigned_tier?`, `reviewer_notes?`, `internal_notes?` | `{ success, status, tier }` | Any admin |
| 5 | `update_flow_tier` | `flow_id`, `tier` | `{ success, tier, selling_price, creator_payout }` | Any admin |
| 6 | `publish_flow` | `flow_id` | `{ success }` | Any admin |
| 7 | `unpublish_flow` | `flow_id`, `reason?` | `{ success }` | Any admin |
| 8 | `manage_badge` | `flow_id`, `badge`, `remove?` | `{ success }` | Any admin |
| 9 | `list_admins` | — | `{ admins: [...] }` | `super_admin` only |
| 10 | `create_admin` | `email`, `password`, `display_name`, `admin_role?` | `{ admin: {...} }` | `super_admin` only |
| 11 | `toggle_admin_active` | `admin_id`, `is_active` | `{ success }` | `super_admin` only |
| 12 | `bulk_review` | `flow_ids[]`, `decision`, `reviewer_notes?` | `{ success, count }` | Any admin |

#### JWT Verification (server-side)

```typescript
async function verifyAdmin(req: Request) {
  // 1. Extract Bearer token from Authorization header
  // 2. Split JWT into header.payload.signature
  // 3. Import JWT_SECRET as HMAC key
  // 4. Verify signature against header.payload
  // 5. Parse payload, check type === "admin" and exp > now
  // 6. Return { sub, role, email, display_name } or null
}
```

---

## 6. Flow Lifecycle & Status Machine

```
                  ┌──────────────────────────┐
                  │                          │
  ┌───────┐    ┌──▼──────┐    ┌───────────┐  │
  │ draft │───▶│submitted│───▶│ in_review │  │
  └───────┘    └─────────┘    └─────┬─────┘  │
                  ▲                 │         │
                  │         ┌───────┼────────┐│
                  │         │       │        ││
                  │    ┌────▼───┐ ┌─▼──────┐ ││
                  │    │rejected│ │approved │ ││
                  │    └────────┘ └────┬────┘ ││
                  │                    │      ││
            ┌─────┴──────────┐   ┌────▼────┐ ││
            │changes_requested│  │published│─┘│
            └────────────────┘   └────┬────┘  │
                                      │       │
                                 ┌────▼────┐  │
                                 │archived │  │
                                 └─────────┘  │
                                      │       │
                                      └───────┘
```

### Status Transitions by Action

| Action | From Status | To Status | Triggered By |
|--------|------------|-----------|-------------|
| Creator submits | `draft` | `submitted` | `submit-flow-for-review` edge function |
| Creator resubmits | `changes_requested` / `rejected` | `submitted` | `submit-flow-for-review` edge function |
| Admin reviews (approve) | `submitted` / `in_review` | `published` | `admin-api: submit_review` |
| Admin reviews (reject) | `submitted` / `in_review` | `rejected` | `admin-api: submit_review` |
| Admin reviews (changes) | `submitted` / `in_review` | `changes_requested` | `admin-api: submit_review` |
| Admin publishes | `approved` | `published` | `admin-api: publish_flow` |
| Admin unpublishes | `published` | `submitted` | `admin-api: unpublish_flow` |

---

## 7. Pricing Engine

### 7.1 Tier Configuration

| Tier | Multiplier | RevShare % | Label |
|------|-----------|------------|-------|
| `standard` | 2.5× | 20% | Standard |
| `pro` | 3.0× | 25% | Pro |
| `masterpiece` | 3.5× | 30% | Master Piece |

### 7.2 Pricing Formula

```
selling_price       = ceil(api_cost × multiplier)
contribution_margin = selling_price − api_cost
creator_payout      = ceil(contribution_margin × revshare_percent)
```

### 7.3 When Pricing is Calculated

1. **On approval** (`submit_review` with `decision: "approved"`) — uses `base_cost` from flows table
2. **On tier change** (`update_flow_tier`) — recalculates using current `api_cost`

### 7.4 Client-Side Pricing Utility

**File**: `src/lib/flowPricing.ts`

```typescript
import { calculateFlowPricing } from "@/lib/flowPricing";

const result = calculateFlowPricing(apiCost, "pro", performanceBonusPercent);
// Returns: { apiCost, tier, multiplier, sellingPrice, contributionMargin,
//            revsharePercent, creatorPayout, performanceBonusPercent, effectiveRevsharePercent }
```

Performance bonus (future feature) is additive on base revshare, capped at 50%.

---

## 8. Scoring Rubric

### 8.1 Seven Evaluation Dimensions

| # | Field | Key | Description |
|---|-------|-----|-------------|
| 1 | Output Quality | `output_quality` | Visual/audio quality of generated outputs |
| 2 | Consistency | `consistency` | Reliability across multiple runs |
| 3 | Commercial Usability | `commercial_usability` | Suitability for business use |
| 4 | Originality | `originality` | Uniqueness of the workflow approach |
| 5 | Efficiency | `efficiency` | Credit cost vs. output value |
| 6 | Workflow Clarity | `workflow_clarity` | How well-structured the flow is |
| 7 | Safety | `safety` | Content safety and compliance |

Each field is scored **1–5**. Total score range: **0–35**.

### 8.2 Auto-Tier Suggestion

```typescript
function suggestTier(totalScore: number): FlowTier {
  if (totalScore >= 25) return "masterpiece";
  if (totalScore >= 15) return "pro";
  return "standard";
}
```

| Score Range | Suggested Tier |
|-------------|---------------|
| 0–14 | Standard |
| 15–24 | Pro |
| 25–35 | Master Piece |

The admin can override the suggested tier by setting `assigned_tier`.

### 8.3 UI Component

**File**: `src/components/admin/ScoringRubricForm.tsx`

- Renders 7 slider inputs (1-5 scale)
- Shows real-time total score and suggested tier
- Includes reviewer notes (visible to creator) and internal notes (admin-only)

---

## 9. UI Components & Pages

### 9.1 Route Map

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/login` | `AdminLogin.tsx` | Admin login form |
| `/admin` | `AdminDashboard.tsx` | Overview stats (flow counts, revenue, pending reviews) |
| `/admin/review-queue` | `ReviewQueue.tsx` | List flows by status with filters, bulk actions |
| `/admin/review/:flowId` | `FlowReview.tsx` | Detail view + scoring rubric + decision actions |
| `/admin/active` | `FlowActive.tsx` | Manage published flows (tier, badges, unpublish) |
| `/admin/settings` | `AdminSettings.tsx` | Admin account management (super_admin only) |

All `/admin/*` routes are wrapped in `AdminAuthProvider` → `AdminProtectedRoute`.

### 9.2 Layout

**File**: `src/components/admin/AdminLayout.tsx`

- Sidebar navigation with links to all admin pages
- Top bar with admin name, role badge, and logout button
- Completely separate from `DashboardLayout` and `CreatorLayout`

### 9.3 Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `ScoringRubricForm` | `src/components/admin/ScoringRubricForm.tsx` | 7-field scoring form with sliders |
| `ReviewDecisionActions` | `src/components/admin/ReviewDecisionActions.tsx` | Approve/Reject/Request Changes buttons |
| `TierBadge` | `src/components/admin/TierBadge.tsx` | Visual tier indicator (Standard/Pro/Master Piece) |
| `FlowStatusBadge` | `src/components/admin/FlowStatusBadge.tsx` | Status pill with color coding |
| `ReadOnlyFlowCanvas` | `src/components/admin/ReadOnlyFlowCanvas.tsx` | Non-editable flow node canvas for inspection |
| `FlowPreviewPanel` | `src/components/admin/FlowPreviewPanel.tsx` | Side panel for flow details |
| `AdminProtectedRoute` | `src/components/admin/AdminProtectedRoute.tsx` | JWT validation guard |
| `AuditLogViewer` | `src/components/admin/AuditLogViewer.tsx` | Admin action history viewer |
| `PersonaAnalytics` | `src/components/admin/PersonaAnalytics.tsx` | User persona analytics |

### 9.4 Admin Auth Context

**File**: `src/contexts/AdminAuthContext.tsx`

Exported:
- `AdminAuthProvider` — context provider component
- `useAdminAuth()` — hook returning `{ admin, loading, token, login, logout, adminFetch }`

### 9.5 Type Definitions

**File**: `src/types/admin.ts`

```typescript
export type FlowTier = "standard" | "pro" | "masterpiece";
export type FlowStatus = "draft" | "submitted" | "in_review" | "approved"
  | "changes_requested" | "rejected" | "published" | "archived";
export type AdminRole = "super_admin" | "review_admin" | "finance_admin" | "ops_admin";
export type ReviewDecision = "pending" | "approved" | "rejected" | "changes_requested";

export interface AdminAccount {
  id: string;
  email: string;
  admin_role: AdminRole;
  display_name: string;
}

export interface AdminJWTPayload {
  sub: string;
  email: string;
  role: AdminRole;
  display_name: string;
  type: "admin";
  exp: number;
  iat: number;
}

export const TIER_CONFIG = {
  standard:    { label: "Standard",     multiplier: 2.5, revshare: 0.2,  color: "blue" },
  pro:         { label: "Pro",          multiplier: 3.0, revshare: 0.25, color: "gold" },
  masterpiece: { label: "Master Piece", multiplier: 3.5, revshare: 0.3,  color: "mystic" },
};

export const RUBRIC_FIELDS = [
  { key: "output_quality",       label: "Output Quality",       description: "Visual/audio quality of generated outputs" },
  { key: "consistency",          label: "Consistency",           description: "Reliability across multiple runs" },
  { key: "commercial_usability", label: "Commercial Usability",  description: "Suitability for business use" },
  { key: "originality",          label: "Originality",           description: "Uniqueness of the workflow approach" },
  { key: "efficiency",           label: "Efficiency",            description: "Credit cost vs. output value" },
  { key: "workflow_clarity",     label: "Workflow Clarity",      description: "How well-structured the flow is" },
  { key: "safety",               label: "Safety",                description: "Content safety and compliance" },
];
```

---

## 10. Notification System

When an admin takes a review action, the system automatically inserts a notification for the flow creator:

| Decision | Notification Title | Icon |
|----------|-------------------|------|
| `approved` | 🎉 Flow Approved! | `check-circle` |
| `rejected` | Flow Rejected | `x-circle` |
| `changes_requested` | Changes Requested | `message-square` |
| Unpublish | Flow Sent Back for Review | `alert-circle` |

All notifications:
- Are inserted into the `notifications` table
- Have `type: "flow_review"`
- Include `link: "/creator/flows"` for navigation
- Include `metadata: { flow_id, decision, tier }` for context

Creators see these in the `NotificationCenter` component.

---

## 11. Configuration

### 11.1 `supabase/config.toml`

```toml
project_id = "qywqanfbmnhcleojzwtq"

[functions.admin-login]
verify_jwt = false

[functions.admin-api]
verify_jwt = false
```

Both admin functions use `verify_jwt = false` because they implement their own JWT authentication system separate from Supabase Auth.

### 11.2 Required Secrets

| Secret | Used By | Purpose |
|--------|---------|---------|
| `JWT_SECRET` | `admin-login`, `admin-api` | HMAC key for signing/verifying admin JWTs |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin-login`, `admin-api` | Bypass RLS for admin operations |
| `SUPABASE_URL` | All edge functions | Database connection |

### 11.3 Default Admin Account

The initial super admin is seeded via the `seed` or `reseed` action:

- **Email**: `admin@mediaforge.com`
- **Password**: `123456`
- **Role**: `super_admin`

⚠️ Change the password in production.

---

## File Index

| File | Purpose |
|------|---------|
| `src/contexts/AdminAuthContext.tsx` | Admin auth state management |
| `src/types/admin.ts` | TypeScript types and constants |
| `src/lib/flowPricing.ts` | Client-side pricing calculator |
| `src/components/admin/AdminLayout.tsx` | Admin panel layout (sidebar + topbar) |
| `src/components/admin/AdminProtectedRoute.tsx` | Route guard |
| `src/components/admin/ScoringRubricForm.tsx` | 7-field scoring form |
| `src/components/admin/ReviewDecisionActions.tsx` | Decision buttons |
| `src/components/admin/TierBadge.tsx` | Tier indicator |
| `src/components/admin/FlowStatusBadge.tsx` | Status pill |
| `src/components/admin/ReadOnlyFlowCanvas.tsx` | Flow canvas viewer |
| `src/components/admin/FlowPreviewPanel.tsx` | Flow detail side panel |
| `src/components/admin/AuditLogViewer.tsx` | Audit log viewer |
| `src/pages/admin/AdminLogin.tsx` | Login page |
| `src/pages/admin/AdminDashboard.tsx` | Dashboard page |
| `src/pages/admin/ReviewQueue.tsx` | Review queue page |
| `src/pages/admin/FlowReview.tsx` | Flow review page |
| `src/pages/admin/FlowActive.tsx` | Active flows management |
| `src/pages/admin/AdminSettings.tsx` | Admin account settings |
| `supabase/functions/admin-login/index.ts` | Login/seed edge function |
| `supabase/functions/admin-api/index.ts` | Admin API edge function |
