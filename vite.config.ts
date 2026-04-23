import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

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
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
}));
