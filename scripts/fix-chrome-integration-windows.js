#!/usr/bin/env node

/**
 * Fix Claude Code Chrome Integration on Windows (Node.js / npm install)
 *
 * Problem:
 *   When Claude Code is installed via npm (running under Node.js instead of the
 *   standalone Bun binary), the Chrome integration fails on Windows due to three bugs:
 *
 *   1. Named pipe path format — Node.js net.createConnection needs forward slashes
 *      (//./pipe/name) but the code produces backslashes (\\.\pipe\name) which only
 *      work under Bun.
 *
 *   2. WebSocket bridge feature flag — The "tengu_copper_bridge" flag is remotely
 *      enabled, routing connections through a cloud WebSocket bridge instead of the
 *      local named pipe. The bridge fails silently.
 *
 *   3. Native host Bun crash — The chrome-native-host.bat calls claude.exe (Bun
 *      standalone) which crashes with "panic(main thread): Internal assertion failure"
 *      when creating Windows named pipes.
 *
 * Symptoms:
 *   - "Browser extension is not connected" error when using mcp__claude-in-chrome__* tools
 *   - Running `echo '{"type":"ping"}' | claude.exe --chrome-native-host` crashes with
 *     Bun panic
 *   - Chrome extension side panel works fine on its own
 *
 * Usage:
 *   node scripts/fix-chrome-integration-windows.js
 *
 * After running:
 *   1. Restart Chrome completely (close all windows, check system tray)
 *   2. Restart Claude Code (exit and run `claude` again)
 *
 * Related GitHub issues:
 *   - https://github.com/anthropics/claude-code/issues/23828 (Windows & WSL fixes)
 *   - https://github.com/anthropics/claude-code/issues/21381 (Bun assertion failure)
 *   - https://github.com/anthropics/claude-code/issues/23526 (getSocketPaths missing pipe)
 *
 * Tested on: Windows 10, Node.js v20.18.0, Claude Code v2.1.84
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Resolve cli.js location ─────────────────────────────────────────────────

function findCliJs() {
  // Try common npm global locations
  const candidates = [
    // nvm-windows
    path.join(process.execPath, "..", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    // Standard npm global (Windows)
    path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    // npx / global prefix
    ...(process.env.npm_config_prefix
      ? [path.join(process.env.npm_config_prefix, "node_modules", "@anthropic-ai", "claude-code", "cli.js")]
      : []),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: ask npm
  try {
    const { execSync } = require("child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const npmPath = path.join(root, "@anthropic-ai", "claude-code", "cli.js");
    if (fs.existsSync(npmPath)) return npmPath;
  } catch {}

  return null;
}

// ── Patch cli.js ─────────────────────────────────────────────────────────────

function patchCliJs(filePath) {
  console.log(`\nPatching: ${filePath}`);

  // Create backup
  const backupPath = filePath + ".bak";
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log(`  Backup created: ${backupPath}`);
  } else {
    console.log(`  Backup already exists: ${backupPath}`);
  }

  let content = fs.readFileSync(filePath, "utf8");
  let patchCount = 0;

  // ── Patch 1: Fix getSocketPath pipe path (\\.\pipe\ → //./pipe/) ──────

  const idx1 = content.indexOf('CR4()==="win32")return`');
  if (idx1 !== -1) {
    const end1 = content.indexOf("`;return wb(Ca6()", idx1);
    if (end1 !== -1) {
      const oldSingle = content.substring(idx1, end1 + 1);
      if (oldSingle.includes("\\\\")) {
        content = content.replace(oldSingle, 'CR4()==="win32")return`//./pipe/${pR4()}`');
        console.log("  [Patch 1a] Fixed getSocketPath pipe path format");
        patchCount++;
      } else {
        console.log("  [Patch 1a] Already patched (getSocketPath)");
      }
    }
  }

  // ── Patch 2: Fix getSocketPaths pipe path ──────────────────────────────

  const idx2 = content.indexOf('CR4()==="win32")return[`');
  if (idx2 !== -1) {
    const end2 = content.indexOf("`];let q=", idx2);
    if (end2 !== -1) {
      const oldMulti = content.substring(idx2, end2 + 1);
      if (oldMulti.includes("\\\\")) {
        content = content.replace(oldMulti, 'CR4()==="win32")return[`//./pipe/${pR4()}`');
        console.log("  [Patch 2]  Fixed getSocketPaths pipe path format");
        patchCount++;
      } else {
        console.log("  [Patch 2]  Already patched (getSocketPaths)");
      }
    }
  }

  // ── Patch 3: Disable WebSocket bridge (force local named pipe) ─────────

  const bridgePattern = 'function LxY(){if(!u8("tengu_copper_bridge",!1))return;';
  const bridgePatched = "function LxY(){return;";
  if (content.includes(bridgePattern)) {
    content = content.replace(bridgePattern, bridgePatched);
    console.log("  [Patch 3]  Disabled WebSocket bridge (using local pipe)");
    patchCount++;
  } else if (content.includes(bridgePatched)) {
    console.log("  [Patch 3]  Already patched (bridge disabled)");
  } else {
    console.log("  [Patch 3]  WARNING: Could not find bridge function to patch");
  }

  if (patchCount > 0) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`\n  Applied ${patchCount} patch(es) to cli.js`);
  } else {
    console.log("\n  All patches already applied, no changes needed");
  }

  return patchCount;
}

// ── Patch chrome-native-host.bat ─────────────────────────────────────────────

function patchBatchFile(cliJsPath) {
  const batPath = path.join(os.homedir(), ".claude-work", "chrome", "chrome-native-host.bat");

  if (!fs.existsSync(batPath)) {
    console.log(`\nBatch file not found: ${batPath}`);
    console.log("  Run `claude --chrome` first to generate it, then re-run this script.");
    return false;
  }

  const current = fs.readFileSync(batPath, "utf8");
  const nodeExe = process.execPath;
  const expected = `@echo off\r\nREM Chrome native host wrapper script\r\nREM Modified to use Node.js instead of Bun (workaround for Bun crash on Windows)\r\n"${nodeExe}" "${cliJsPath}" --chrome-native-host\r\n`;

  // Check if already using node
  if (current.includes("node.exe") && current.includes("cli.js")) {
    console.log(`\nBatch file already patched: ${batPath}`);
    return true;
  }

  // Backup
  const bakPath = batPath + ".bak";
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(batPath, bakPath);
    console.log(`\nBatch file backup: ${bakPath}`);
  }

  fs.writeFileSync(batPath, expected, "utf8");
  console.log(`\nPatched batch file: ${batPath}`);
  console.log(`  Now uses: "${nodeExe}" "${cliJsPath}" --chrome-native-host`);
  return true;
}

// ── Verify native host works ─────────────────────────────────────────────────

function verifyNativeHost(cliJsPath) {
  console.log("\nVerifying native host...");
  const { execSync } = require("child_process");
  try {
    const result = execSync(
      `echo {"type":"ping"} | "${process.execPath}" "${cliJsPath}" --chrome-native-host 2>&1`,
      { timeout: 5000, encoding: "utf8" }
    );
    if (result.includes("Socket server listening")) {
      console.log("  Native host starts successfully (Node.js)");
      return true;
    }
  } catch (e) {
    const output = e.stdout || e.stderr || "";
    if (output.includes("Socket server listening")) {
      console.log("  Native host starts successfully (Node.js)");
      return true;
    }
    if (output.includes("EADDRINUSE")) {
      console.log("  Native host OK (pipe already in use by running session)");
      return true;
    }
    console.log("  WARNING: Native host test inconclusive");
    console.log("  Output:", output.substring(0, 200));
  }
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("=== Claude Code Chrome Integration Fix for Windows ===\n");

  if (os.platform() !== "win32") {
    console.log("This fix is only needed on Windows. Exiting.");
    process.exit(0);
  }

  // Find cli.js
  const cliJsPath = findCliJs();
  if (!cliJsPath) {
    console.error("ERROR: Could not find cli.js. Make sure @anthropic-ai/claude-code is installed globally:");
    console.error("  npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }
  console.log(`Found cli.js: ${cliJsPath}`);

  // Apply patches
  patchCliJs(cliJsPath);
  patchBatchFile(cliJsPath);
  verifyNativeHost(cliJsPath);

  console.log("\n=== Done ===");
  console.log("\nNext steps:");
  console.log("  1. Restart Chrome completely (close all windows + system tray)");
  console.log("  2. Restart Claude Code (exit current session, run `claude` again)");
  console.log("  3. Test with: mcp__claude-in-chrome__tabs_context_mcp");
  console.log("\nNote: You may need to re-run this script after updating @anthropic-ai/claude-code.");
}

main();
