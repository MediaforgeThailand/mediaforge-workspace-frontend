#!/usr/bin/env node
/**
 * The previous bulk rewriter incorrectly stripped one `../` from files
 * that were copied from `apps/web/src/components/welcome/` (now under
 * `src/features/editor/components/welcome/`). Those files originally
 * lived one level above `components/editor/` in the source tree, so the
 * blanket "strip one ../" rule was wrong for them.
 *
 * This script restores the correct depth by ADDING `../` back to any
 * import in welcome/* that targets a sibling editor folder.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const WELCOME_DIRS = [
  path.resolve("src/features/editor/components/welcome"),
  path.resolve("src/features/editor/components/audio-mixer"),
];
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

// Add one `../` back. Match `../sib/...` (the shorter, broken form) and
// rewrite to `../../sib/...`. Also match `./sib/...` (Toast case before
// I patched it manually) → `../sib/...`.
const REWRITES = [
  // `../sib/...` → `../../sib/...`
  /(['"`])(\.\.)\/([^./'"`][^/'"`]*)((?:\/[^'"`]*)?)\1/g,
];

let changed = 0;
let scanned = 0;
for (const dir of WELCOME_DIRS) {
for await (const file of walk(dir)) {
  scanned++;
  const original = await fs.readFile(file, "utf8");
  const next = original.replace(REWRITES[0], (full, q, prefix, sibling, rest) => {
    if (!SIBLINGS.has(sibling)) return full;
    return `${q}../../${sibling}${rest}${q}`;
  });
  if (next !== original) {
    await fs.writeFile(file, next, "utf8");
    changed++;
  }
}
}

console.log(`Scanned ${scanned} files, rewrote ${changed}.`);
