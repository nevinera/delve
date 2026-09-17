import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "client",
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
        editor: resolve(__dirname, "client/src/editor/main.jsx"),
        classEditor: resolve(__dirname, "client/src/classEditor/main.jsx"),
        unitTypeEditor: resolve(__dirname, "client/src/unitTypeEditor/main.jsx"),
        itemEditor: resolve(__dirname, "client/src/itemEditor/main.jsx"),
        mapEditor: resolve(__dirname, "client/src/mapEditor/main.jsx"),
        zoneEditor: resolve(__dirname, "client/src/zoneEditor/main.jsx"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  plugins: [react()],
});
