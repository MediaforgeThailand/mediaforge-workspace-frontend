#!/usr/bin/env node
/**
 * MediaForge Database + Storage Migration Script
 * Transfers schema, data, AND storage files between Supabase instances via REST API.
 *
 * Schema is applied via `supabase db reset` which runs all files in
 * supabase/migrations/ — giving you the exact same schema, policies,
 * triggers, and functions as production.
 *
 * Prerequisites:
 *   npm install @supabase/supabase-js dotenv
 *
 * Usage:
 *   SOURCE_SUPABASE_URL=https://xxx.supabase.co \
 *   SOURCE_SERVICE_ROLE_KEY=eyJ... \
 *   DEST_SUPABASE_URL=https://yyy.supabase.co \
 *   DEST_SERVICE_ROLE_KEY=eyJ... \
 *   node migrate_data.mjs
 *
 * Options (env vars):
 *   SKIP_STORAGE=true       → skip storage migration
 *   SKIP_DATA=true          → skip database migration
 *   SKIP_SCHEMA=true        → skip schema reset (use existing dest schema)
 *   ONLY_TABLES=flows,profiles → migrate only specific tables
 *
 * IMPORTANT — Stripe:
 *   Production uses Stripe TEST mode (pk_test_ / sk_test_ keys).
 *   The payment_transactions and credit_batches tables contain Stripe test
 *   IDs (e.g. pi_xxx, sub_xxx). These are safe to migrate as-is for local
 *   dev since they reference the same Stripe test account.
 *   If you switch to Stripe LIVE mode, do NOT migrate payment data.
 *
 * FK SAFETY (added):
 *   - Tables are processed strictly sequentially in TABLE_ORDER (await per table).
 *   - After each successful upsert, the set of inserted PKs is recorded in
 *     `insertedIds`. Child tables consult `FK_DEPENDENCIES` and drop any rows
 *     whose parent key is missing — preventing FK constraint violations like:
 *       flow_category_mappings_flow_id_fkey
 *       flow_runs_flow_id_fkey
 *       flow_reviews_flow_id_fkey
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });

// ── Config ──────────────────────────────────────────────────────────────────
const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY = process.env.SOURCE_SERVICE_ROLE_KEY;
const DEST_URL = process.env.DEST_SUPABASE_URL;
const DEST_KEY = process.env.DEST_SERVICE_ROLE_KEY;
const SKIP_STORAGE = process.env.SKIP_STORAGE === "true";
const SKIP_DATA = process.env.SKIP_DATA === "true";
const SKIP_SCHEMA = process.env.SKIP_SCHEMA === "true";
const ONLY_TABLES = process.env.ONLY_TABLES?.split(",").filter(Boolean) || [];

if (!SOURCE_URL || !SOURCE_KEY || !DEST_URL || !DEST_KEY) {
  console.error(
    "Missing env vars. Set SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, DEST_SUPABASE_URL, DEST_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const dest = createClient(DEST_URL, DEST_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Tables in FK-safe insert order ──────────────────────────────────────────
// IMPORTANT: Parents MUST come before children. The orphan-filter below
// (FK_DEPENDENCIES) relies on parents being already populated in `insertedIds`.
const TABLE_ORDER = [
  // 1. Independent / root tables
  "admin_accounts",
  "subscription_plans",
  "subscription_settings",
  "credit_packages",
  "credit_costs",
  "topup_packages",
  "copilot_system_prompts",
  "system_prompt_versions",
  "prompt_knowledge",
  "preset_sections",
  "homepage_sections",
  "flow_categories",
  "demo_budget",
  "demo_links",
  "redemption_codes",
  "phone_otps",

  // 2. User-linked (profiles MUST come before any table referencing user_id)
  "profiles",
  "user_roles",
  "user_credits",
  "brand_contexts",
  "user_personas",
  "cash_wallets",
  "cash_wallet_transactions",

  // 3. Presets (FK to preset_sections.key)
  "presets",

  // 4. Flows ecosystem — `flows` MUST come before any flow-* child
  "flows",
  "flow_category_mappings",
  "flow_nodes",
  "flow_versions",
  "flow_runs",
  "flow_reviews",
  "flow_badges",
  "flow_metrics",
  "flow_test_runs",
  "flow_user_reviews",
  "pipeline_executions",

  // 5. Credits & payments
  "credit_batches",
  "credit_transactions",
  "payment_transactions",

  // 6. Angle prompts
  "angle_prompts",
  "angle_prompt_inputs",
  "angle_prompt_steps",

  // 7. Homepage featured (FK → flows, homepage_sections)
  "homepage_featured",

  // 8. Community
  "community_posts",
  "community_likes",
  "community_comments",

  // 9. Chat
  "chat_conversations",
  "chat_messages",

  // 10. Notifications & misc
  "notifications",
  "partner_leads",
  "stock_downloads",
  "processing_jobs",

  // 11. User assets (generated media)
  "user_assets",

  // 12. Spaces
  "spaces",
  "space_nodes",
  "space_edges",

  // 13. Referrals & Partner program
  "referral_codes",
  "referral_clicks",
  "referrals",
  "referral_credit_grants",
  "partner_applications",
  "partners",
  "commission_events",
  "payout_requests",

  // 14. Logs (large tables last)
  "admin_audit_logs",
  "api_usage_logs",
  "affiliate_audit_log",
  "rate_limits",
  "analytics_events",
];

// Storage buckets to migrate
const STORAGE_BUCKETS = [
  { name: "ai-media", public: false },
  { name: "user_assets", public: false },
  { name: "videos", public: false },
  { name: "kyc-docs", public: false },
  { name: "landing-videos", public: true },
  { name: "preset-thumbnails", public: true },
  { name: "angle-prompt-media", public: true },
];

// Tables where primary key is NOT "id"
const PK_MAP = {
  flow_metrics: "flow_id",
  user_credits: "user_id",
  subscription_settings: "key",
  cash_wallets: "user_id",
  partners: "user_id",
};

// Columns that are GENERATED ALWAYS and cannot be inserted
const GENERATED_COLUMNS = {
  flow_reviews: ["total_score"],
};

// ── FK Orphan-Filter Definitions ────────────────────────────────────────────
// For each child table, list its FK columns and the parent table they point to.
// Before upserting, rows whose FK value is missing from the parent's inserted-ID
// set are dropped (logged as orphans). This guarantees no FK constraint errors.
//
// `parent` = parent table name (must appear earlier in TABLE_ORDER).
// `column` = FK column on the child table.
// `parentKey` (optional) = parent column being referenced (defaults to PK_MAP[parent] || "id").
const FK_DEPENDENCIES = {
  flow_category_mappings: [
    { column: "flow_id", parent: "flows" },
    { column: "category_id", parent: "flow_categories" },
  ],
  flow_nodes: [{ column: "flow_id", parent: "flows" }],
  flow_versions: [{ column: "flow_id", parent: "flows" }],
  flow_runs: [
    { column: "flow_id", parent: "flows" },
    { column: "user_id", parent: "profiles", parentKey: "user_id" },
  ],
  flow_reviews: [{ column: "flow_id", parent: "flows" }],
  flow_badges: [{ column: "flow_id", parent: "flows" }],
  flow_metrics: [{ column: "flow_id", parent: "flows" }],
  flow_test_runs: [
    { column: "flow_id", parent: "flows" },
    { column: "user_id", parent: "profiles", parentKey: "user_id" },
  ],
  flow_user_reviews: [
    { column: "flow_id", parent: "flows" },
    { column: "flow_run_id", parent: "flow_runs" },
    { column: "user_id", parent: "profiles", parentKey: "user_id" },
  ],
  pipeline_executions: [
    { column: "flow_id", parent: "flows" },
    { column: "flow_run_id", parent: "flow_runs", optional: true },
    { column: "user_id", parent: "profiles", parentKey: "user_id" },
  ],
  homepage_featured: [
    { column: "flow_id", parent: "flows" },
    { column: "section_id", parent: "homepage_sections", optional: true },
  ],
  community_likes: [{ column: "post_id", parent: "community_posts" }],
  community_comments: [{ column: "post_id", parent: "community_posts" }],
  chat_messages: [{ column: "conversation_id", parent: "chat_conversations" }],
  presets: [{ column: "section", parent: "preset_sections", parentKey: "key" }],
  angle_prompt_inputs: [{ column: "angle_prompt_id", parent: "angle_prompts" }],
  angle_prompt_steps: [{ column: "angle_prompt_id", parent: "angle_prompts" }],
  payment_transactions: [
    { column: "package_id", parent: "credit_packages", optional: true },
  ],
  partners: [{ column: "application_id", parent: "partner_applications" }],
  referrals: [{ column: "code_id", parent: "referral_codes" }],
  referral_clicks: [{ column: "code_id", parent: "referral_codes", optional: true }],
  referral_credit_grants: [{ column: "referral_id", parent: "referrals" }],
  commission_events: [
    { column: "referral_id", parent: "referrals" },
    { column: "partner_user_id", parent: "partners", parentKey: "user_id" },
  ],
  payout_requests: [{ column: "partner_user_id", parent: "partners", parentKey: "user_id" }],
};

// Records the set of successfully inserted PKs per table, keyed as:
//   insertedIds[table][parentKey] = Set(values)
// This is what the orphan filter consults.
const insertedIds = {};

function recordInsertedIds(table, rows) {
  if (!rows || rows.length === 0) return;
  const pk = PK_MAP[table] || "id";
  if (!insertedIds[table]) insertedIds[table] = {};
  if (!insertedIds[table][pk]) insertedIds[table][pk] = new Set();
  const set = insertedIds[table][pk];
  for (const row of rows) {
    const val = row[pk];
    if (val !== undefined && val !== null) set.add(val);
  }
  // Also index by user_id for tables where it's a commonly referenced column.
  if (pk !== "user_id" && rows[0] && "user_id" in rows[0]) {
    if (!insertedIds[table]["user_id"]) insertedIds[table]["user_id"] = new Set();
    const uset = insertedIds[table]["user_id"];
    for (const row of rows) {
      if (row.user_id) uset.add(row.user_id);
    }
  }
}

function filterOrphans(table, rows) {
  const deps = FK_DEPENDENCIES[table];
  if (!deps || rows.length === 0) return { kept: rows, dropped: 0, reasons: {} };

  const reasons = {};
  const kept = [];

  for (const row of rows) {
    let orphan = false;
    let reasonKey = null;

    for (const dep of deps) {
      const value = row[dep.column];
      // Null FK is fine if the column is nullable / optional.
      if (value === null || value === undefined) {
        if (dep.optional) continue;
        // If column exists but is null, treat as fine — DB will accept null FKs
        // for nullable columns. We can't introspect nullability here cheaply,
        // so trust the source: if source had null, dest will too.
        continue;
      }
      const parentKey = dep.parentKey || PK_MAP[dep.parent] || "id";
      const parentSet = insertedIds[dep.parent]?.[parentKey];
      if (!parentSet || !parentSet.has(value)) {
        orphan = true;
        reasonKey = `${dep.column}→${dep.parent}.${parentKey}`;
        break;
      }
    }

    if (orphan) {
      reasons[reasonKey] = (reasons[reasonKey] || 0) + 1;
    } else {
      kept.push(row);
    }
  }

  return { kept, dropped: rows.length - kept.length, reasons };
}

// ── Schema Phase ──────────────────────────────────────────────────────────

/**
 * Resets the local database and applies all migrations from supabase/migrations/.
 * This gives the exact same schema, RLS policies, triggers, and functions as production.
 */
async function resetSchema() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Phase 0: Schema Reset (supabase db reset)       │");
  console.log("└──────────────────────────────────────────────────┘\n");

  try {
    console.log("  Running supabase db reset...");
    const output = execSync("npx supabase db reset", {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
    });
    const text = output.toString();
    if (text) console.log("  " + text.trim().split("\n").join("\n  "));
    console.log("  ✅ Schema reset complete (all migrations applied)\n");
    return { success: true };
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    if (stderr.includes("Finished supabase db reset") || stderr.includes("Restarting containers")) {
      console.log("  ✅ Schema reset complete (all migrations applied)\n");
      await new Promise((r) => setTimeout(r, 5000));
      return { success: true };
    }
    console.error("  ✗ Schema reset failed:", stderr);
    console.error("  Continuing with existing schema...\n");
    return { success: false };
  }
}

// ── Auth Users Helper ─────────────────────────────────────────────────────

async function syncAuthUsers() {
  console.log("  Syncing auth.users from source profiles...");
  const profiles = await fetchAll(source, "profiles");
  if (profiles.length === 0) {
    console.log("  No profiles found, skipping auth.users sync.\n");
    return;
  }

  const userIdTables = [
    { table: "user_roles", col: "user_id" },
    { table: "cash_wallets", col: "user_id" },
    { table: "cash_wallet_transactions", col: "user_id" },
    { table: "referral_codes", col: "user_id" },
    { table: "referrals", col: "referrer_user_id" },
    { table: "referrals", col: "referred_user_id" },
    { table: "referral_credit_grants", col: "user_id" },
    { table: "partner_applications", col: "user_id" },
    { table: "partners", col: "user_id" },
    { table: "commission_events", col: "partner_user_id" },
    { table: "commission_events", col: "referred_user_id" },
    { table: "payout_requests", col: "partner_user_id" },
    { table: "demo_links", col: "redeemed_by" },
    { table: "demo_links", col: "created_by" },
    { table: "flow_user_reviews", col: "user_id" },
  ];

  const extraIds = [];
  for (const { table, col } of userIdTables) {
    try {
      const rows = await fetchAll(source, table);
      extraIds.push(...rows.map((r) => r[col]).filter(Boolean));
    } catch {
      // table may not exist in source — safe to ignore
    }
  }

  const allUserIds = [...profiles.map((p) => p.user_id), ...extraIds].filter(Boolean);
  const userIds = [...new Set(allUserIds)];

  const values = userIds
    .map((id) => `('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', 'stub-${id}@local.dev', '', now(), now(), '{}', '{}', now(), false)`)
    .join(",\n    ");

  const sql = `
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, is_sso_user)
    VALUES
    ${values}
    ON CONFLICT (id) DO NOTHING;
  `;

  try {
    execSync(
      `docker exec -i supabase_db_qywqanfbmnhcleojzwtq psql -U postgres -d postgres`,
      { input: sql, stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }
    );
    console.log(`  ✅ Inserted ${userIds.length} stub auth.users\n`);
  } catch (err) {
    console.error("  ✗ Failed to sync auth.users:", err.stderr?.toString() || err.message, "\n");
  }
}

// ── Column Safety Net ─────────────────────────────────────────────────────

function getDestTableColumns(table) {
  try {
    const result = execSync(
      `docker exec -i supabase_db_qywqanfbmnhcleojzwtq psql -U postgres -d postgres -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position;"`,
      { stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
    );
    return result.toString().trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getDestColumns(table) {
  const cols = getDestTableColumns(table);
  return cols.length > 0 ? new Set(cols) : null;
}

function filterColumns(rows, destColumns, table) {
  if (!destColumns || rows.length === 0) return rows;
  const sourceColumns = Object.keys(rows[0]);
  const dropped = sourceColumns.filter((c) => !destColumns.has(c));
  if (dropped.length > 0) {
    console.log(`\n  ⚠ ${table}: dropping columns not in dest: [${dropped.join(", ")}]`);
  }
  if (dropped.length === 0) return rows;
  return rows.map((row) => {
    const filtered = {};
    for (const [k, v] of Object.entries(row)) {
      if (destColumns.has(k)) filtered[k] = v;
    }
    return filtered;
  });
}

// ── Database Helpers ────────────────────────────────────────────────────────

async function fetchAll(client, table, batchSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    let res = await client
      .from(table)
      .select("*")
      .range(from, from + batchSize - 1)
      .order("created_at", { ascending: true, nullsFirst: true });

    if (res.error?.message?.includes("created_at")) {
      res = await client
        .from(table)
        .select("*")
        .range(from, from + batchSize - 1);
    }
    if (res.error) throw new Error(`Fetch ${table}: ${res.error.message}`);
    if (!res.data || res.data.length === 0) break;
    rows.push(...res.data);
    if (res.data.length < batchSize) break;
    from += batchSize;
  }
  return rows;
}

/**
 * Upserts rows in batches and returns the array of rows that were
 * successfully accepted (so we can record their IDs for child orphan-filtering).
 */
async function upsertBatch(client, table, rows, batchSize = 500) {
  const pk = PK_MAP[table] || "id";
  const successful = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict: pk, ignoreDuplicates: false });
    if (error) {
      console.error(`  ✗ Upsert ${table} batch ${i}-${i + batch.length}: ${error.message}`);
      // Fall back to per-row so we know exactly which rows succeeded.
      for (const row of batch) {
        const { error: e2 } = await client
          .from(table)
          .upsert(row, { onConflict: pk, ignoreDuplicates: false });
        if (e2) console.error(`    ✗ Row ${row[pk] || "?"}: ${e2.message}`);
        else successful.push(row);
      }
    } else {
      successful.push(...batch);
    }
  }
  return successful;
}

// ── Storage Helpers ─────────────────────────────────────────────────────────

async function listAllFiles(client, bucket, folder = "", allFiles = []) {
  const { data, error } = await client.storage.from(bucket).list(folder, {
    limit: 1000,
    offset: 0,
  });
  if (error) {
    console.error(`  ✗ List ${bucket}/${folder}: ${error.message}`);
    return allFiles;
  }
  for (const item of data || []) {
    const path = folder ? `${folder}/${item.name}` : item.name;
    if (item.id) {
      allFiles.push(path);
    } else {
      await listAllFiles(client, bucket, path, allFiles);
    }
  }
  return allFiles;
}

async function migrateFile(srcClient, destClient, bucket, filePath) {
  const { data: blob, error: dlErr } = await srcClient.storage
    .from(bucket)
    .download(filePath);
  if (dlErr) {
    console.error(`    ✗ Download ${bucket}/${filePath}: ${dlErr.message}`);
    return false;
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeMap = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
    mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    pdf: "application/pdf", json: "application/json",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  const { error: upErr } = await destClient.storage
    .from(bucket)
    .upload(filePath, blob, { contentType, upsert: true });
  if (upErr) {
    console.error(`    ✗ Upload ${bucket}/${filePath}: ${upErr.message}`);
    return false;
  }
  return true;
}

async function ensureBucket(client, bucket, isPublic) {
  const { error } = await client.storage.createBucket(bucket, {
    public: isPublic,
  });
  if (error && !error.message?.includes("already exists")) {
    console.error(`  ⚠ Create bucket ${bucket}: ${error.message}`);
  }
}

// ── Main: Database Migration ────────────────────────────────────────────────

async function migrateDatabase() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Phase 1: Database Migration                     │");
  console.log("└──────────────────────────────────────────────────┘\n");

  // Insert stub auth.users so FK constraints on profiles/user_roles are satisfied
  await syncAuthUsers();

  // Truncate tables that have seed data from migrations to avoid duplicate key conflicts
  console.log("  Clearing seed data from migration-seeded tables...");
  const seedTables = ["credit_costs", "copilot_system_prompts", "system_prompt_versions", "preset_sections", "subscription_plans", "homepage_sections", "user_roles", "flow_categories", "topup_packages"];
  for (const t of seedTables) {
    try {
      execSync(
        `docker exec -i supabase_db_qywqanfbmnhcleojzwtq psql -U postgres -d postgres -c "TRUNCATE public.${t} CASCADE;"`,
        { stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
      );
    } catch {}
  }
  console.log("  ✅ Seed data cleared\n");

  const tables = ONLY_TABLES.length > 0
    ? TABLE_ORDER.filter((t) => ONLY_TABLES.includes(t))
    : TABLE_ORDER;

  const results = [];
  let totalRows = 0;

  // STRICTLY SEQUENTIAL: each table fully completes (and registers its inserted
  // IDs) before the next begins. This is required for the orphan filter to work.
  for (const table of tables) {
    const t0 = Date.now();
    process.stdout.write(`⏳ ${table.padEnd(28)}`);

    try {
      const rows = await fetchAll(source, table);
      if (rows.length === 0) {
        console.log("  → 0 rows (skipped)");
        results.push({ table, rows: 0, inserted: 0, ms: Date.now() - t0, status: "skip" });
        continue;
      }

      // 1) Strip columns that don't exist in destination
      const destColumns = getDestColumns(table);
      let filteredRows = filterColumns(rows, destColumns, table);

      // 2) Strip generated columns that can't be inserted
      const genCols = GENERATED_COLUMNS[table];
      if (genCols) {
        filteredRows = filteredRows.map((row) => {
          const copy = { ...row };
          for (const col of genCols) delete copy[col];
          return copy;
        });
        console.log(`  (stripped generated: ${genCols.join(", ")})`);
      }

      // 3) ORPHAN FILTER — drop rows whose FK parents weren't inserted.
      const { kept, dropped, reasons } = filterOrphans(table, filteredRows);
      if (dropped > 0) {
        const reasonStr = Object.entries(reasons)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        console.log(`\n  ⚠ ${table}: dropped ${dropped} orphan rows (${reasonStr})`);
      }
      filteredRows = kept;

      if (filteredRows.length === 0) {
        console.log(`  → ${rows.length} exported, 0 upserted (all orphans)`);
        results.push({ table, rows: rows.length, inserted: 0, dropped, ms: Date.now() - t0, status: "skip" });
        continue;
      }

      // 4) Upsert and capture which rows succeeded
      const successfulRows = await upsertBatch(dest, table, filteredRows);

      // 5) Register successful PKs so child tables can reference them safely
      recordInsertedIds(table, successfulRows);

      const ms = Date.now() - t0;
      const inserted = successfulRows.length;
      totalRows += inserted;
      console.log(`  → ${rows.length} exported, ${inserted} upserted${dropped ? `, ${dropped} orphans dropped` : ""} (${ms}ms)`);
      results.push({ table, rows: rows.length, inserted, dropped, ms, status: "ok" });
    } catch (err) {
      const ms = Date.now() - t0;
      console.log(`  ✗ ERROR: ${err.message} (${ms}ms)`);
      results.push({ table, rows: 0, inserted: 0, ms, status: "error", error: err.message });
    }
  }

  // Summary
  const ok = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skip");
  const errors = results.filter((r) => r.status === "error");
  const totalDropped = results.reduce((sum, r) => sum + (r.dropped || 0), 0);
  console.log(`\n  ✅ Migrated: ${ok.length} tables (${totalRows} total rows)`);
  console.log(`  ⏭  Skipped:  ${skipped.length} tables (empty or all orphans)`);
  if (totalDropped > 0) console.log(`  🧹 Orphans:  ${totalDropped} child rows dropped`);
  if (errors.length > 0) {
    console.log(`  ❌ Errors:   ${errors.length} tables:`);
    errors.forEach((e) => console.log(`     - ${e.table}: ${e.error}`));
  }
  return { ok: ok.length, errors: errors.length, totalRows, totalDropped };
}

// ── Main: Storage Migration ─────────────────────────────────────────────────

async function migrateStorage() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Phase 2: Storage Migration                      │");
  console.log("└──────────────────────────────────────────────────┘\n");

  let totalFiles = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const bucket of STORAGE_BUCKETS) {
    const t0 = Date.now();
    process.stdout.write(`📦 ${bucket.name.padEnd(24)}`);

    await ensureBucket(dest, bucket.name, bucket.public);

    const files = await listAllFiles(source, bucket.name);
    if (files.length === 0) {
      console.log("  → 0 files (skipped)");
      continue;
    }

    console.log(`  → ${files.length} files found`);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if ((i + 1) % 10 === 0 || i === files.length - 1) {
        process.stdout.write(`\r   Uploading ${bucket.name}: ${i + 1}/${files.length}...`);
      }
      const ok = await migrateFile(source, dest, bucket.name, file);
      if (ok) success++;
      else failed++;
    }

    const ms = Date.now() - t0;
    console.log(`\r   ✅ ${bucket.name}: ${success} uploaded, ${failed} failed (${(ms / 1000).toFixed(1)}s)`);
    totalFiles += files.length;
    totalSuccess += success;
    totalFailed += failed;
  }

  console.log(`\n  📁 Total: ${totalSuccess}/${totalFiles} files migrated, ${totalFailed} failed`);
  return { totalFiles, totalSuccess, totalFailed };
}

// ── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  MediaForge Full Migration (REST API)           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Source:  ${SOURCE_URL}`);
  console.log(`Dest:    ${DEST_URL}`);
  console.log(`Tables:  ${TABLE_ORDER.length}`);
  console.log(`Buckets: ${STORAGE_BUCKETS.length}`);
  if (SKIP_SCHEMA) console.log("⚠ SKIP_SCHEMA=true → skipping schema reset");
  if (SKIP_DATA) console.log("⚠ SKIP_DATA=true → skipping database migration");
  if (SKIP_STORAGE) console.log("⚠ SKIP_STORAGE=true → skipping storage migration");
  if (ONLY_TABLES.length) console.log(`⚠ ONLY_TABLES=${ONLY_TABLES.join(",")}`);

  const t0 = Date.now();
  let schemaResult = null;
  let dbResult = null;
  let storageResult = null;

  if (!SKIP_SCHEMA) {
    schemaResult = await resetSchema();
  }

  if (!SKIP_DATA) {
    dbResult = await migrateDatabase();
  }

  if (!SKIP_STORAGE) {
    storageResult = await migrateStorage();
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n════════════════════════════════════════════════════");
  console.log("MIGRATION COMPLETE");
  console.log("════════════════════════════════════════════════════");
  if (schemaResult) {
    console.log(`  Schema:   ${schemaResult.success ? "✅ applied" : "✗ failed (used existing)"}`);
  }
  if (dbResult) {
    console.log(`  Database: ${dbResult.ok} tables, ${dbResult.totalRows} rows${dbResult.totalDropped ? `, ${dbResult.totalDropped} orphans dropped` : ""}${dbResult.errors > 0 ? `, ${dbResult.errors} errors` : ""}`);
  }
  if (storageResult) {
    console.log(`  Storage:  ${storageResult.totalSuccess}/${storageResult.totalFiles} files${storageResult.totalFailed > 0 ? `, ${storageResult.totalFailed} failed` : ""}`);
  }
  console.log(`  Duration: ${totalSec}s`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
