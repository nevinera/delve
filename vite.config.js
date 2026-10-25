import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({command}) => ({
  root: "client",
  // Built files are served from /client/ (public/client), and URLs vite
  // writes into the bundle need that.
  base: command === "build" ? "/client/" : "/",
  build: {
    outDir: "../public/client",
    emptyOutDir: true,
    // Content-hashed filenames, with manifest.json mapping each entry to its
    // current file for app/helpers/vite_helper.rb.
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/src/main.js"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  worker: {format: "es"},
}));
