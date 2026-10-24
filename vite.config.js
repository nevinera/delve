import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({command}) => ({
  root: "client",
  // Built files are served from /client/ (public/client), and URLs vite
  // writes into the bundle, like the cell map render worker's, need that.
  // The dev server (zz-harness) still serves from the root.
  base: command === "build" ? "/client/" : "/",
  build: {
    outDir: "../public/client",
    emptyOutDir: true,
    // Content-hashed filenames so a new build gets a new URL instead of
    // relying on Cache-Control headers to avoid serving a stale bundle
    // (see config/environments/production.rb) - manifest.json maps each
    // entry to its current hashed filename for app/helpers/vite_helper.rb.
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/src/main.jsx"),
        abilityEditor: resolve(__dirname, "client/src/abilityEditor/main.jsx"),
        classEditor: resolve(__dirname, "client/src/classEditor/main.jsx"),
        worldBuilder: resolve(__dirname, "client/src/worldBuilder/main.jsx"),
        spike3d: resolve(__dirname, "client/src/spike3d/main.js"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  // Module workers (client/src/cellMap/renderWorker.js) import other modules.
  worker: {format: "es"},
  plugins: [react()],
}));
