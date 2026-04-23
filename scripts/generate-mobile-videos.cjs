/**
 * Generate mobile-optimized video thumbnails (480p, low bitrate).
 * Run: node scripts/generate-mobile-videos.js
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ffmpeg = require("ffmpeg-static");
const videosDir = path.join(__dirname, "../public/videos");
const mobileDir = path.join(videosDir, "mobile");

const SOURCES = [
  "Thumbnail_Packshot_1.mp4",
  "Thumbnail_magic_bg.mp4",
  "thumbnail_ba.mp4",
  "thumbnail_try_on.mp4",
  "thumbnail_lifestyle_1.mp4",
  "thumbnail_ads2.mp4",
  "Thumbnail_preview_New.mp4",
  "thumbnail_vector.mp4",
  "thumbnail_brand_mockup.mp4",
];

if (!fs.existsSync(mobileDir)) fs.mkdirSync(mobileDir, { recursive: true });

for (const file of SOURCES) {
  const input = path.join(videosDir, file);
  const output = path.join(mobileDir, file);

  if (!fs.existsSync(input)) {
    console.log(`SKIP ${file} (not found)`);
    continue;
  }

  if (fs.existsSync(output)) {
    console.log(`SKIP ${file} (already exists)`);
    continue;
  }

  console.log(`Processing ${file}...`);
  try {
    execSync(
      `"${ffmpeg}" -i "${input}" -vf "scale=-2:480" -c:v libx264 -preset slow -crf 30 -an -movflags +faststart -y "${output}"`,
      { stdio: "inherit" }
    );
    const orig = (fs.statSync(input).size / 1024 / 1024).toFixed(1);
    const compressed = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
    console.log(`  ${orig}MB → ${compressed}MB`);
  } catch (e) {
    console.error(`  FAILED: ${e.message}`);
  }
}

console.log("\nDone! Mobile videos in public/videos/mobile/");
