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
    rollupOptions: {
      input: resolve(__dirname, "client/src/main.jsx"),
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [react()],
});
