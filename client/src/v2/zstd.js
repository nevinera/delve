import { decompress } from "fzstd";

// zstd for text world files (heights.js): read with fzstd (plain JS, ready at once), and written
// with the reference zstd built as WebAssembly (@bokuweb/zstd-wasm), which has to be loaded first,
// by loadZipper(). Until it has, nothing's zipped, and writers keep what they'd have zipped in a
// longer form that needs no zipping. zstdify was tried first: some of what it wrote couldn't be
// read back, by it or anything else.

const LEVEL = 19;
let wasm = null;
let loading = null;

// Loads the writer, once.
export function loadZipper() {
  loading ??= import("@bokuweb/zstd-wasm").then(async (module) => {
    await module.init();
    wasm = module;
  });
  return loading;
}

// `bytes` zipped, or null where the writer isn't loaded or what it makes doesn't read back.
export function zip(bytes) {
  if (!wasm) return null;
  try {
    const zipped = wasm.compress(bytes, LEVEL);
    const back = decompress(zipped);
    return back.length === bytes.length && back.every((b, k) => b === bytes[k]) ? zipped : null;
  } catch {
    return null;
  }
}

export const unzip = (bytes) => decompress(bytes);
