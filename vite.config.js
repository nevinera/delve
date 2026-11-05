import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { brotliCompressSync, constants, gzipSync } from "zlib";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// The commit the client's built from, for error reports.
function commit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return "";
  }
}

// Writes a .br and a .gz copy beside each built file worth compressing, which Rails sends to
// browsers that take them (config/environments/production.rb). Maps are left be.
const COMPRESSED = /\.(js|css|json|wasm|svg|html)$/;
function precompress(dir) {
  return {
    name: "precompress",
    apply: "build",
    closeBundle() {
      const walk = (at) => {
        for (const name of readdirSync(at)) {
          const path = resolve(at, name);
          if (statSync(path).isDirectory()) walk(path);
          else if (COMPRESSED.test(name) && statSync(path).size > 1024) {
            const bytes = readFileSync(path);
            writeFileSync(`${path}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }));
            writeFileSync(`${path}.gz`, gzipSync(bytes, { level: 9 }));
          }
        }
      };
      walk(dir);
    },
  };
}

export default defineConfig(({command}) => ({
  plugins: [precompress(resolve(__dirname, "public/client"))],
  root: "client",
  // Built files are served from /client/ (public/client), and URLs vite
  // writes into the bundle need that.
  base: command === "build" ? "/client/" : "/",
  define: { __BUILD__: JSON.stringify(commit()) },
  build: {
    outDir: "../public/client",
    emptyOutDir: true,
    // Content-hashed filenames, with manifest.json mapping each entry to its
    // current file for app/helpers/vite_helper.rb.
    manifest: true,
    // Maps for the errors page to turn reported stacks back into source lines. They're published,
    // as the code is, but the built files don't point browsers at them.
    sourcemap: "hidden",
    // three.js alone is about 550KB, and /create loads it in its own chunk.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "client/src/main.js"),
        create: resolve(__dirname, "client/src/create/main.js"),
        objects: resolve(__dirname, "client/src/objects/main.js"),
        classes: resolve(__dirname, "client/src/classes/main.js"),
        play: resolve(__dirname, "client/src/play/main.js"),
        characterBuilder: resolve(__dirname, "client/src/character/builder.js"),
        characterList: resolve(__dirname, "client/src/character/list.js"),
        animationLab: resolve(__dirname, "client/src/character/lab.js"),
        creatures: resolve(__dirname, "client/src/character/creatures.js"),
        creature: resolve(__dirname, "client/src/character/creature.js"),
        monsterLab: resolve(__dirname, "client/src/character/monsterLab.js"),
        clientErrors: resolve(__dirname, "client/src/errors/page.js"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  worker: {format: "es"},
  // zstd-wasm finds its .wasm beside itself, which pre-bundling would move it away from.
  optimizeDeps: {exclude: ["@bokuweb/zstd-wasm"]},
}));
