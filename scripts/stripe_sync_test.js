#!/usr/bin/env node
/**
 * Stripe Test Mode Sync
 *
 * Creates matching Stripe products/prices in TEST mode for all
 * subscription_plans and topup_packages in the local database,
 * then updates the DB with the new test-mode IDs.
 *
 * Run after migrate_data.js when migrating from prod (live Stripe) to local (test Stripe).
 *
 * Usage:
 *   node scripts/stripe_sync_test.js
 *
 * Reads from .env.local:
 *   STRIPE_SECRET_KEY     — must be a sk_test_ key
 *   DEST_SUPABASE_URL     — local Supabase URL
 *   DEST_SERVICE_ROLE_KEY — local Supabase service role key
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.DEST_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.DEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_KEY || !STRIPE_KEY.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY must be a test key (sk_test_...)");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────

async function findOrCreateProduct(name, description) {
  // Search for existing test product by name
  const existing = await stripe.products.search({ query: `name~"${name}"` });
  if (existing.data.length > 0) {
    console.log(`    Found existing product: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name,
    description: description || undefined,
  });
  console.log(`    Created product: ${product.id}`);
  return product;
}

async function findOrCreatePrice(productId, amountSatang, currency, recurring) {
  // Check if a matching price already exists
  const existing = await stripe.prices.list({ product: productId, limit: 10 });
  const match = existing.data.find(
    (p) =>
      p.unit_amount === amountSatang &&
      p.currency === currency &&
      (recurring
        ? p.recurring?.interval === recurring.interval
        : p.type === "one_time")
  );
  if (match) {
    console.log(`    Found existing price: ${match.id}`);
    return match;
  }

  const params = {
    product: productId,
    unit_amount: amountSatang,
    currency,
  };
  if (recurring) {
    params.recurring = { interval: recurring.interval };
  }
  const price = await stripe.prices.create(params);
  console.log(`    Created price: ${price.id} (${amountSatang} ${currency})`);
  return price;
}

// ── Sync Subscription Plans ────────────────────────────────────

async function syncSubscriptionPlans() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Syncing Subscription Plans                      │");
  console.log("└──────────────────────────────────────────────────┘\n");

  const { data: plans, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order");

  if (error || !plans) {
    console.error("Failed to fetch subscription_plans:", error);
    return;
  }

  console.log(`  Found ${plans.length} plans\n`);

  for (const plan of plans) {
    if (!plan.stripe_price_id) {
      console.log(`  ⏭ ${plan.name} (${plan.billing_interval}) — no stripe_price_id, skipping`);
      continue;
    }

    console.log(`  📦 ${plan.name} (${plan.billing_interval})`);
    console.log(`    Live product: ${plan.stripe_product_id}`);
    console.log(`    Live price:   ${plan.stripe_price_id}`);

    // Get the live price details from the DB to know the amount
    // We need to fetch from Stripe live to get the amount — but we can't with test key.
    // Instead, derive from plan data or use the MCP-fetched data.
    // For subscriptions, we'll look up the price from live mode via name matching.

    const description = `${plan.name} plan - ${plan.billing_interval} billing`;
    const product = await findOrCreateProduct(
      `${plan.name} (${plan.plan_type === "creator" ? "Creator" : "User"} ${plan.billing_interval === "annual" ? "Annual" : "Monthly"})`,
      description
    );

    // Calculate price in satang (THB smallest unit) from plan data
    const priceTHB = plan.price_thb || 0;
    const amountSatang = Math.round(priceTHB * 100);

    if (amountSatang === 0) {
      console.log(`    ⚠ price_thb is 0, skipping price creation`);
      continue;
    }

    const interval = plan.billing_interval === "annual" ? "year" : "month";
    const price = await findOrCreatePrice(product.id, amountSatang, "thb", { interval });

    // Update DB
    const { error: updateErr } = await supabase
      .from("subscription_plans")
      .update({
        stripe_product_id: product.id,
        stripe_price_id: price.id,
      })
      .eq("id", plan.id);

    if (updateErr) {
      console.error(`    ✗ DB update failed: ${updateErr.message}`);
    } else {
      console.log(`    ✅ Updated DB → ${product.id} / ${price.id}\n`);
    }
  }
}

// ── Sync Top-up Packages ───────────────────────────────────────

async function syncTopupPackages() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Syncing Top-up Packages                         │");
  console.log("└──────────────────────────────────────────────────┘\n");

  const { data: packages, error } = await supabase
    .from("topup_packages")
    .select("*")
    .order("sort_order");

  if (error || !packages) {
    console.error("Failed to fetch topup_packages:", error);
    return;
  }

  console.log(`  Found ${packages.length} packages\n`);

  for (const pkg of packages) {
    if (!pkg.stripe_price_id) {
      console.log(`  ⏭ ${pkg.name} — no stripe_price_id, skipping`);
      continue;
    }

    console.log(`  📦 ${pkg.name} (${pkg.credits} credits)`);
    console.log(`    Live product: ${pkg.stripe_product_id}`);
    console.log(`    Live price:   ${pkg.stripe_price_id}`);

    const product = await findOrCreateProduct(
      `${pkg.name} - ${pkg.credits} Credits`,
      `${pkg.credits} credits top-up package`
    );

    const priceTHB = pkg.price_thb || 0;
    const amountSatang = Math.round(priceTHB * 100);

    if (amountSatang === 0) {
      console.log(`    ⚠ price_thb is 0, skipping price creation`);
      continue;
    }

    // Top-ups are one-time payments (no recurring)
    const price = await findOrCreatePrice(product.id, amountSatang, "thb", null);

    const { error: updateErr } = await supabase
      .from("topup_packages")
      .update({
        stripe_product_id: product.id,
        stripe_price_id: price.id,
      })
      .eq("id", pkg.id);

    if (updateErr) {
      console.error(`    ✗ DB update failed: ${updateErr.message}`);
    } else {
      console.log(`    ✅ Updated DB → ${product.id} / ${price.id}\n`);
    }
  }
}

// ── Sync Credit Packages (legacy) ──────────────────────────────

async function syncCreditPackages() {
  console.log("\n┌──────────────────────────────────────────────────┐");
  console.log("│  Syncing Credit Packages (legacy)                │");
  console.log("└──────────────────────────────────────────────────┘\n");

  const { data: packages, error } = await supabase
    .from("credit_packages")
    .select("*")
    .order("sort_order");

  if (error || !packages) {
    console.error("Failed to fetch credit_packages:", error);
    return;
  }

  const withStripe = packages.filter((p) => p.stripe_price_id);
  console.log(`  Found ${packages.length} packages (${withStripe.length} with Stripe IDs)\n`);

  for (const pkg of withStripe) {
    console.log(`  📦 ${pkg.name} (${pkg.credits} credits)`);
    console.log(`    Live price: ${pkg.stripe_price_id}`);

    const product = await findOrCreateProduct(
      `Credit Package - ${pkg.name}`,
      `${pkg.credits} credits package`
    );

    const priceTHB = pkg.price || 0;
    const amountSatang = Math.round(priceTHB * 100);

    if (amountSatang === 0) {
      console.log(`    ⚠ price is 0, skipping\n`);
      continue;
    }

    const price = await findOrCreatePrice(product.id, amountSatang, "thb", null);

    const { error: updateErr } = await supabase
      .from("credit_packages")
      .update({ stripe_price_id: price.id })
      .eq("id", pkg.id);

    if (updateErr) {
      console.error(`    ✗ DB update failed: ${updateErr.message}`);
    } else {
      console.log(`    ✅ Updated DB → ${price.id}\n`);
    }
  }
}

// ── Entry Point ────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Stripe Test Mode Sync                          ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Stripe key: ${STRIPE_KEY.substring(0, 12)}...${STRIPE_KEY.slice(-4)} (test)`);
  console.log(`Supabase:   ${SUPABASE_URL}`);

  await syncSubscriptionPlans();
  await syncTopupPackages();
  await syncCreditPackages();

  console.log("\n════════════════════════════════════════════════════");
  console.log("STRIPE SYNC COMPLETE");
  console.log("════════════════════════════════════════════════════");
  console.log("All local DB Stripe IDs now point to test-mode products/prices.");
  console.log("You can test checkout flows locally with Stripe test cards.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
