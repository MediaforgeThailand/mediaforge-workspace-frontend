#!/usr/bin/env node

/**
 * Generates Figma plugin code for importing screenshots.
 * Each output file can be copy-pasted into the Figma Plugin API console,
 * or used with the Figma MCP `use_figma` tool.
 *
 * Usage: node scripts/import-to-figma.js
 * Output: scripts/figma-import-codes/ directory with one .js file per image
 */

const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "screenshots", "figma");
const pngDir = path.join(__dirname, "..", "screenshots");
const outDir = path.join(__dirname, "figma-import-codes");
fs.mkdirSync(outDir, { recursive: true });

const pages = {
  "Public Pages": [
    { name: "Landing", frame: "Landing Page", w: 1440, h: 7505 },
    { name: "Auth", frame: "Auth (Login/Signup)", w: 1440, h: 900 },
    { name: "ResetPassword", frame: "Reset Password", w: 1440, h: 900 },
    { name: "Terms", frame: "Terms of Service", w: 1440, h: 1134 },
    { name: "Privacy", frame: "Privacy Policy", w: 1440, h: 1518 },
    { name: "NotFound", frame: "404 Not Found", w: 1440, h: 900 },
    { name: "Admin_Login", frame: "Admin Login", w: 1440, h: 900 },
  ],
  "Dashboard Pages": [
    { name: "Dashboard_Home", frame: "Dashboard - Home", w: 1440, h: 980 },
    { name: "Dashboard_FlowStudioDashboard", frame: "Dashboard - Flow Studio", w: 1440, h: 900 },
    { name: "Dashboard_AssetManager", frame: "Dashboard - Assets", w: 1440, h: 900 },
    { name: "Dashboard_Pricing", frame: "Dashboard - Pricing", w: 1440, h: 1433 },
    { name: "Dashboard_Settings", frame: "Dashboard - Settings", w: 1440, h: 900 },
    { name: "Dashboard_Transactions", frame: "Dashboard - Transactions", w: 1440, h: 900 },
    { name: "Dashboard_Analytics", frame: "Dashboard - Analytics", w: 1440, h: 900 },
    { name: "Dashboard_Community", frame: "Dashboard - Community", w: 1440, h: 900 },
    { name: "Dashboard_StockLibrary", frame: "Dashboard - Stock Library", w: 1440, h: 900 },
  ],
};

let total = 0;
for (const [pageName, images] of Object.entries(pages)) {
  for (const { name, frame, w, h } of images) {
    const jpgPath = path.join(dir, name + ".jpg");
    if (!fs.existsSync(jpgPath)) {
      console.log(`SKIP ${name}: no jpg found`);
      continue;
    }

    const b64 = fs.readFileSync(jpgPath).toString("base64");

    const code = `
const page = figma.root.children.find(p => p.name === '${pageName}');
await figma.setCurrentPageAsync(page);
const b64 = '${b64}';
const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const img = figma.createImage(raw);
const existingFrames = page.children.filter(n => n.type === 'FRAME');
const xOffset = existingFrames.reduce((max, f) => Math.max(max, f.x + f.width + 100), 0);
const frame = figma.createFrame();
frame.name = '${frame}';
frame.resize(${w}, ${h});
frame.x = xOffset;
frame.y = 0;
frame.fills = [{type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash}];
figma.notify('Imported: ${frame}');
`;

    if (code.length > 50000) {
      console.log(`SKIP ${name}: code too long (${code.length})`);
      continue;
    }

    const outFile = path.join(outDir, `${String(total + 1).padStart(2, "0")}_${name}.js`);
    fs.writeFileSync(outFile, code);
    console.log(`OK ${name} (${pageName}) -> ${path.basename(outFile)} [${code.length} chars]`);
    total++;
  }
}

console.log(`\nGenerated ${total} import scripts in ${outDir}`);
