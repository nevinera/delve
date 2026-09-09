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
      input: {
        main: resolve(__dirname, "client/src/main.jsx"),
        editor: resolve(__dirname, "client/src/editor/main.jsx"),
        classEditor: resolve(__dirname, "client/src/classEditor/main.jsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [react()],
});
