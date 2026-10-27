import { run } from "./localSave.js";

// The world's object library (its collections.json and objects/ files, see objects/collections.js)
// kept in the browser apart from the rest of the world, so the world editor and the objects page
// can both change it, even open at once. Each page holds the library in its World's files and
// keeps them in step with the store: pull reads the store over them, push writes what changed,
// and a change pushed in one tab is pulled in the others.

const STORE = "library";
const CHANNEL = "delve3d-library";
// Kept with every write, so an empty library can be told from one never kept.
const MARKER = "#kept";

export const COLLECTIONS_PATH = "collections.json";
export const isLibraryPath = (path) => path === COLLECTIONS_PATH || /^objects\/[0-9a-z]{8}\.json$/.test(path);

// The store's records as a Map of path -> JSON text, or null when nothing was ever kept.
const readStore = () =>
  run(
    "readonly",
    (store) => {
      const keys = store.getAllKeys();
      const values = store.getAll();
      return () => {
        const records = new Map(keys.result.map((key, i) => [key, values.result[i]]));
        if (!records.delete(MARKER)) return null;
        return records;
      };
    },
    STORE,
  );

// Writes changes, a Map of path -> JSON text, or null to delete; `clear` empties the store first.
const writeStore = (changes, clear = false) =>
  run(
    "readwrite",
    (store) => {
      if (clear) store.clear();
      store.put("1", MARKER);
      for (const [path, text] of changes) text === null ? store.delete(path) : store.put(text, path);
      return () => undefined;
    },
    STORE,
  );

export class LibrarySync {
  // onRemote() hears that another tab changed the library, after it's pulled into the world.
  constructor(world, onRemote) {
    this.world = world;
    this.kept = new Map(); // path -> JSON text, as the store last had it
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = async () => {
      if (await this.pull()) onRemote?.();
    };
  }

  // The world's library files, as path -> JSON text.
  current() {
    const out = new Map();
    for (const path of this.world.files.keys()) if (isLibraryPath(path)) out.set(path, JSON.stringify(this.world.readJson(path)));
    return out;
  }

  // Reads the store over the world's library, returning whether anything changed. A store that
  // never kept a library takes the world's instead, as the first time after an older editor.
  async pull() {
    const stored = await readStore();
    if (!stored) {
      await writeStore(this.current());
      this.kept = this.current();
      return false;
    }
    const before = this.current();
    for (const path of before.keys()) if (!stored.has(path)) this.world.files.delete(path);
    for (const [path, text] of stored) if (before.get(path) !== text) this.world.writeJson(path, JSON.parse(text));
    this.kept = stored;
    return before.size !== stored.size || [...stored].some(([path, text]) => before.get(path) !== text);
  }

  // Writes what's changed in the world's library since the last pull or push, telling other tabs.
  async push() {
    const now = this.current();
    const changes = new Map();
    for (const [path, text] of now) if (this.kept.get(path) !== text) changes.set(path, text);
    for (const path of this.kept.keys()) if (!now.has(path)) changes.set(path, null);
    if (!changes.size) return;
    await writeStore(changes);
    this.kept = now;
    this.channel.postMessage("changed");
  }

  // Makes the store hold `world`'s library and nothing else: for a new or uploaded world.
  async replace(world) {
    this.world = world;
    this.kept = this.current();
    await writeStore(this.kept, true);
    this.channel.postMessage("changed");
  }
}
