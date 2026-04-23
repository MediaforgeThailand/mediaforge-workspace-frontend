#!/usr/bin/env node

/**
 * Upload screenshots to Figma file as image frames.
 *
 * Usage:
 *   1. Get a Figma Personal Access Token from https://www.figma.com/developers/api#access-tokens
 *   2. Run: FIGMA_TOKEN=your_token node scripts/upload-to-figma.js
 *
 * This script:
 *   - Reads all screenshots from screenshots/compressed/
 *   - Uploads them to the Figma file as image fills in frames
 *   - Organizes them into the 3 pages: Public Pages, Dashboard Pages, Admin & Creator
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const FILE_KEY = "XpkJMOterhsxgBNiwB59Id";
const TOKEN = process.env.FIGMA_TOKEN;

if (!TOKEN) {
  console.error("ERROR: Set FIGMA_TOKEN environment variable");
  console.error("  Get one from: https://www.figma.com/developers/api#access-tokens");
  process.exit(1);
}

function getPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function figmaApi(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.figma.com",
      path: `/v1${endpoint}`,
      method,
      headers: {
        "X-Figma-Token": TOKEN,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function uploadImage(imageBytes) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.figma.com",
      path: `/v1/files/${FILE_KEY}/images`,
      method: "POST",
      headers: {
        "X-Figma-Token": TOKEN,
        "Content-Type": "image/png",
        "Content-Length": imageBytes.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    req.write(imageBytes);
    req.end();
  });
}

const PAGE_ASSIGNMENTS = {
  "Public Pages": [
    "Landing",
    "Auth",
    "ResetPassword",
    "Terms",
    "Privacy",
    "NotFound",
    "Admin_Login",
  ],
  "Dashboard Pages": [
    "Dashboard_Home",
    "Dashboard_Community",
    "Dashboard_StockLibrary",
    "Dashboard_AssetManager",
    "Dashboard_FlowStudioDashboard",
    "Dashboard_Pricing",
    "Dashboard_Settings",
    "Dashboard_Transactions",
    "Dashboard_Analytics",
  ],
};

async function main() {
  console.log("=== Upload Screenshots to Figma ===\n");

  // Get file info
  const file = await figmaApi(`/files/${FILE_KEY}?depth=1`);
  console.log("File:", file.name);
  console.log(
    "Pages:",
    file.document.children.map((p) => p.name).join(", ")
  );

  // Upload each image
  const screenshotDir = path.join(__dirname, "..", "screenshots");
  const compressedDir = path.join(screenshotDir, "compressed");
  const pngDir = screenshotDir;

  const allScreenshots = fs
    .readdirSync(compressedDir)
    .filter((f) => f.endsWith(".jpg"));

  console.log(`\nFound ${allScreenshots.length} screenshots to upload\n`);

  for (const jpgFile of allScreenshots) {
    const name = jpgFile.replace(".jpg", "");
    const pngPath = path.join(pngDir, name + ".png");
    const jpgPath = path.join(compressedDir, jpgFile);

    if (!fs.existsSync(pngPath)) {
      console.log(`  Skipping ${name} (no PNG source for dimensions)`);
      continue;
    }

    const { width, height } = getPngDimensions(pngPath);
    const imageBytes = fs.readFileSync(jpgPath);

    console.log(
      `  Uploading ${name} (${width}x${height}, ${(imageBytes.length / 1024).toFixed(0)}KB)...`
    );

    const result = await uploadImage(imageBytes);
    if (result.error) {
      console.log(`    ERROR: ${JSON.stringify(result)}`);
    } else {
      console.log(`    OK: ${JSON.stringify(result).substring(0, 100)}`);
    }
  }

  console.log("\n=== Done ===");
  console.log(
    "Note: Images are uploaded to the file but need to be placed in frames."
  );
  console.log(
    "Open the Figma file and use the Plugin API console to create frames with the uploaded images."
  );
}

main().catch(console.error);
