// Lets plain Node import the client's modules (client/src), which are
// written for Vite: imports without an extension, and JSON imported
// without `with {type: "json"}`.
import {registerHooks} from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.[a-z]+$/.test(specifier)) throw error;
      for (const ext of [".js", ".jsx"]) {
        try {
          return nextResolve(specifier + ext, context);
        } catch {
          // Try the next.
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".json")) return nextLoad(url, context);
    return {format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true};
  },
});

// A client module, by its path under client/src.
export function client(path) {
  return import(new URL(`../src/${path}`, import.meta.url).href);
}
