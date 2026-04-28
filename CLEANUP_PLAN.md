# Workspace Frontend — Consumer-app Cleanup Plan

This repo started as a fork of `mediaforge-frontend` (the consumer
flow-editor product). The CTO directive is to strip everything down
to the **Workspace product only** before launching at
`workspace.mediaforge.co`.

The cleanup is staged in 3 waves so the build never breaks for more
than one merge at a time.

---

## Wave 1 — orphan pages + creator/partner verticals (LOW RISK)

These are wholly self-contained and have no workspace references.
Delete the files + remove their `<Route>` entries from `App.tsx`.

```
src/pages/
  Landing.tsx                    → consumer marketing landing
  Explore.tsx                    → flow gallery
  PartnerProgram.tsx             → affiliate funnel
  RedeemCode.tsx                 → demo redemption
  DemoLanding.tsx                → demo redemption alt
  partner/                       → affiliate dashboard tree
  creator/                       → entire creator workspace
  play-flow/                     → consumer flow runner
  admin/                         → admin pages (admin lives in admin-hub repo)
  settings/ReferEarn.tsx         → affiliate referrals
  dashboard/
    Home.tsx                     → consumer home
    Explore.tsx                  → marketplace
    History.tsx                  → flow-run history
    Analytics.tsx                → flow analytics (creator)
    StockLibrary.tsx             → stock-image picker
    FlowStudio.tsx               → flow editor
    FlowStudioDashboard.tsx
    FlowAssetDetail.tsx
    FlowSettings.tsx
    CreatorDashboard.tsx
    AssetManager.tsx             → consumer asset library

src/components/
  flow/                          → flow-editor components (KEEP nodes/PromptMentionTextarea.tsx + nodes/nodeApiSchema.ts — workspace uses)
  CreatorLayout.tsx
  CreatorRoute.tsx
  GlobalExecutionWatcher.tsx     → flow run watcher
```

After Wave 1: `App.tsx` collapses to ~40 lines, only auth +
workspace routes remain.

## Wave 2 — repurpose dashboard chrome (MEDIUM RISK)

`DashboardLayout.tsx` + `Settings.tsx` + `Transactions.tsx` +
`Pricing.tsx` need to be ADAPTED, not deleted. They're the only
non-canvas surfaces the workspace product still wants:

  • Settings → workspace user settings (profile, default model)
  • Transactions → workspace credit history (rename to "Usage")
  • Pricing → workspace pricing tiers (B2C + Team)
  • DashboardLayout → workspace shell chrome (sidebar nav)

Plan: keep file, gut the consumer-specific UI, rebuild around
workspace concepts.

## Wave 3 — drop unused libs / hooks (LOW RISK)

Whatever's left orphaned after wave 1+2 — `lib/flowPricing.ts`,
`lib/bundleEnrichment.ts`, `hooks/useCreatorCreditCosts.ts` (rename
+ adapt for workspace), etc. Run `eslint --no-unused-vars` and
delete any zero-reference module.

---

## Routing collapse plan (after Wave 1)

```ts
// Before (consumer): / → Landing → /app/* → /play/* → /creator/* → /admin/*
// After (workspace):
//   /                          → redirect to /app/workspace
//   /auth                      → sign in
//   /reset-password            → password reset
//   /app/workspace             → spaces dashboard
//   /app/workspace/:id         → canvas page
//   /app/settings              → user settings
//   /app/usage                 → credit usage history (was Transactions)
//   /app/pricing               → plan picker
//   /privacy, /terms           → legal pages
//   *                          → 404
```

---

## Credit system adaptation (separate work)

The existing consumer credit pieces stay USEFUL — just need
workspace-shaped wrappers:

| Consumer | Workspace |
|---|---|
| `useCreatorCreditCosts` | rename → `useNodeCreditCosts`, keep RPC |
| `flowPricing.ts` | keep — same model price tables |
| `consume_credits(user_id)` RPC | new `consume_credits_for(user_id, team_id)` that picks the team pool first if team_id is set |
| `user_credits` table | keep for personal users |
| NEW `teams.credit_balance` | for team plans |
| `credit_transactions` | already user-scoped; add team-scoped twin (in SSO migration) |

Dispatcher (`workspace-run-node`) decides which pool to debit:

```
if (workspace.team_id) → consume_credits_for(triggered_by, team_id)
else                   → consume_credits(user_id)        // existing path
```

Refund-on-failure logic stays identical, just routed.

---

## Status

- [ ] Wave 1
- [ ] Wave 2
- [ ] Wave 3
- [ ] Routing collapse
- [ ] Credit system rewire (after teams table is live)
