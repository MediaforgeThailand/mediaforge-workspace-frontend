import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";

// Build version = git commit count on current branch (main).
// Increments with every commit pushed to GitHub. Falls back to date-based number if git unavailable.
function getBuildNumber(): number {
  try {
    return parseInt(
      execSync("git rev-list --count HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(),
      10
    );
  } catch {
    const EPOCH = new Date("2024-01-01T00:00:00Z").getTime();
    return Math.floor((Date.now() - EPOCH) / (1000 * 60 * 60 * 24));
  }
}
function getCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}
const APP_VERSION = `1.${getBuildNumber()}`;
const APP_COMMIT = getCommitHash();


export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  // Treat .wasm files as static assets so the video editor's FFmpeg / FFT
  // bundles can be imported via Vite's asset graph.
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    // FFmpeg uses dynamic imports + workers that confuse the dep optimiser.
    exclude: [
      "@ffmpeg/ffmpeg",
      "@ffmpeg/util",
      "@ffmpeg/core",
      "@ffmpeg/core-mt",
    ],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        // Split heavy vendors into their own chunks so they can be
        // cached independently and so the main app chunk doesn't
        // balloon. three / drei / framer-motion are
        // all large and only needed on dedicated pages; keeping
        // them in separate chunks lets Rollup tree-share them across
        // routes that import them dynamically.
        // NOTE: do NOT split `@xyflow/react` into its own chunk — it reads React hooks at module-init and crashes with `useState` of undefined when separated from `vendor-react`.
        manualChunks: (id) => {
          if (id.includes("node_modules/@xyflow/react")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/react-dom") || (id.includes("node_modules/react/") && !id.includes("@types"))) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("node_modules/three") || id.includes("node_modules/@react-three")) {
            return "vendor-three";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-framer";
          }
          // Heavy editor-only deps — each becomes its own lazy chunk
          // loaded only when /app/editor (and its child routes) is opened.
          if (id.includes("node_modules/mediabunny")) {
            return "vendor-mediabunny";
          }
          if (id.includes("node_modules/@ffmpeg")) {
            return "vendor-ffmpeg";
          }
          if (id.includes("node_modules/gsap") || id.includes("node_modules/@gsap")) {
            return "vendor-gsap";
          }
          if (id.includes("node_modules/react-syntax-highlighter")) {
            return "vendor-syntax-highlighter";
          }
        },
      },
    },
  },
}));
