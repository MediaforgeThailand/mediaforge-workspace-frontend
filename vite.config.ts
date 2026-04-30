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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into their own chunks so they can be
        // cached independently and so the main app chunk doesn't
        // balloon to ~1.1 MB. xyflow / three / drei / framer-motion
        // are all large and only needed on the canvas page; keeping
        // them in separate chunks lets Rollup tree-share them across
        // routes that import them dynamically.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-radix": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          "vendor-xyflow": ["@xyflow/react"],
          "vendor-three": ["three", "@react-three/drei", "@react-three/fiber"],
          "vendor-framer": ["framer-motion"],
        },
      },
    },
  },
}));
