#!/usr/bin/env node
/**
 * One-shot rewrite of the editor's package-style imports
 * (`@openreel/core`, `@openreel/ui`) to the in-tree paths used by
 * mediaforge-workspace-frontend. Idempotent — running it twice does
 * nothing the second time.
 *
 * Run from the workspace-frontend repo root:
 *   node scripts/rewrite-editor-imports.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const TARGET_DIRS = [
  "features/editor",
  "lib/openreel-core",
  "components/openreel-ui",
];

const REPLACEMENTS = [
  // Subpath imports first (so they don't accidentally match the bare-package
  // rule and end up as `@/lib/openreel-core/foo`)
  [/(['"])@openreel\/core\/([^'"]+)\1/g, '$1@/lib/openreel-core/$2$1'],
  [/(['"])@openreel\/ui\/components\/([^'"]+)\1/g, '$1@/components/openreel-ui/components/$2$1'],
  [/(['"])@openreel\/ui\/lib\/([^'"]+)\1/g, '$1@/components/openreel-ui/lib/$2$1'],
  [/(['"])@openreel\/ui\/hooks\/([^'"]+)\1/g, '$1@/components/openreel-ui/hooks/$2$1'],
  [/(['"])@openreel\/ui\/styles\/([^'"]+)\1/g, '$1@/components/openreel-ui/styles/$2$1'],
  [/(['"])@openreel\/ui\/([^'"]+)\1/g, '$1@/components/openreel-ui/$2$1'],
  // Bare package
  [/(['"])@openreel\/core\1/g, '$1@/lib/openreel-core$1'],
  [/(['"])@openreel\/ui\1/g, '$1@/components/openreel-ui$1'],
];

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) {
      yield p;
    }
  }
}

let changed = 0;
let scanned = 0;
for (const sub of TARGET_DIRS) {
  const dir = path.join(ROOT, sub);
  try {
    await fs.access(dir);
  } catch {
    continue;
  }
  for await (const file of walk(dir)) {
    scanned++;
    const original = await fs.readFile(file, "utf8");
    let next = original;
    for (const [pattern, replacement] of REPLACEMENTS) {
      next = next.replace(pattern, replacement);
    }
    if (next !== original) {
      await fs.writeFile(file, next, "utf8");
      changed++;
    }
  }
}

console.log(`Scanned ${scanned} files, rewrote ${changed}.`);
