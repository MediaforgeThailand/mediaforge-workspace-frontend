#!/usr/bin/env node
/**
 * Fix relative imports under src/features/editor/components/** that were
 * authored when the source lived at apps/web/src/components/editor/. The
 * original tree had two levels between components/editor/* and src/ — the
 * new tree has only one. So *every* `../` chain that ends in a sibling
 * folder of the editor feature (stores, services, etc.) is now one level
 * too deep.
 *
 * Strategy: for files under src/features/editor/components/**, find any
 * import that goes up one too many levels and lands at one of the editor
 * sibling folders. Specifically, if a path resolves to a directory
 * matching `src/features/editor/<sibling>/...` after the editor root,
 * strip one `../`.
 *
 * Concretely the original tree had imports like:
 *   - From components/editor/F.tsx: `../../stores/x` → src/stores/x → now must be `../stores/x`
 *   - From components/editor/timeline/F.tsx: `../../../stores/x` → src/stores/x → now must be `../../stores/x`
 *
 * The fix is: any relative import path starting with `../` that contains
 * one of the sibling folder names in its first non-up segment, gets one
 * `../` stripped off.
 *
 * Run from workspace-frontend repo root:
 *   node scripts/fix-editor-relative-paths.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const COMPONENTS_ROOT = path.resolve("src/features/editor/components");
const SIBLINGS = new Set([
  "stores",
  "services",
  "hooks",
  "bridges",
  "utils",
  "config",
  "types",
  "pages",
]);

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) yield p;
  }
}

// Match any quoted relative import that starts with `../` and has a
// sibling folder name as the first non-`../` segment.
//
// e.g. "../../stores/foo" → groups: prefix = "../../", sibling = "stores",
//      rest = "/foo"
const IMPORT_RE = /(['"`])((?:\.\.\/)+)([^./'"`][^/'"`]*)((?:\/[^'"`]*)?)\1/g;

let changed = 0;
let scanned = 0;
for await (const file of walk(COMPONENTS_ROOT)) {
  scanned++;
  const original = await fs.readFile(file, "utf8");
  const next = original.replace(IMPORT_RE, (full, q, prefix, sibling, rest) => {
    if (!SIBLINGS.has(sibling)) return full;
    // Strip one `../` from the prefix.
    const newPrefix = prefix.slice(3);
    if (newPrefix.length === 0) {
      // Was `../sibling/…` → becomes `./sibling/…`
      return `${q}./${sibling}${rest}${q}`;
    }
    return `${q}${newPrefix}${sibling}${rest}${q}`;
  });
  if (next !== original) {
    await fs.writeFile(file, next, "utf8");
    changed++;
  }
}

console.log(`Scanned ${scanned} files, rewrote ${changed}.`);
