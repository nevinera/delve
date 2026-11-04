import { strFromU8, strToU8, unzipSync } from "fflate";
import { keptWorld } from "./store.js";

// The world /create keeps in this browser, as a page other than /create reads it.

// Its JSON files, path -> bytes, with its changes since it was opened: its library, what's placed
// and world.json. Empty when it has none open.
const wanted = (path) => path.endsWith(".json") || path.endsWith(".svg");

export async function keptFiles() {
  const kept = await keptWorld();
  if (!kept) return new Map();
  // A zip's bytes, or a repo's files as a Map.
  let files = kept.bytes instanceof Map ? [...kept.bytes].filter(([path]) => wanted(path)) : Object.entries(unzipSync(kept.bytes, { filter: (file) => wanted(file.name) }));
  const top = files.some(([path]) => path === "world.json") ? null : files[0]?.[0].split("/")[0];
  if (top) files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  // A change of null is a file taken away.
  return new Map([...files, ...[...kept.changes].filter(([path]) => wanted(path))].filter(([, b]) => b));
}

// Those files, read and written as JSON.
export class KeptJson {
  constructor(files) {
    this.files = files;
    this.info = files.has("world.json") ? this.readJson("world.json") : { name: "no world open in /create" };
  }

  readJson(path) {
    return JSON.parse(strFromU8(this.files.get(path)));
  }

  writeJson(path, data) {
    this.files.set(path, strToU8(`${JSON.stringify(data, null, 2)}\n`));
  }
}
