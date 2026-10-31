// /create's IndexedDB: the files of the world it has open ("files": the zip opened last, "world",
// and the files changed since, "changes", path -> bytes), and the world's object library
// ("library", path -> JSON text, as editor/libraryStore.js keeps it), which the objects page
// changes too.

const NAME = "create";
const VERSION = 2;
const MARKER = "#kept"; // kept with every library write, so an empty library can be told from none

function db() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(NAME, VERSION);
    open.onupgradeneeded = () => {
      for (const name of ["files", "library"]) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

// Runs act(objectStore) in a transaction on `name`, resolving with what done() gives once it's
// finished.
async function run(name, mode, act) {
  const base = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = base.transaction(name, mode);
      const done = act(tx.objectStore(name));
      tx.oncomplete = () => resolve(done?.());
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    base.close();
  }
}

export const store = {
  get: (key) =>
    run("files", "readonly", (files) => {
      const req = files.get(key);
      return () => req.result ?? null;
    }),
  set: (key, value) => run("files", "readwrite", (files) => void files.put(value, key)),
  delete: (key) => run("files", "readwrite", (files) => void files.delete(key)).catch(() => {}),
};

// The library's records, path -> JSON text, or null when none was ever kept.
export const readLibrary = () =>
  run("library", "readonly", (library) => {
    const [keys, values] = [library.getAllKeys(), library.getAll()];
    return () => {
      const records = new Map(keys.result.map((key, i) => [key, values.result[i]]));
      return records.delete(MARKER) ? records : null;
    };
  });

// Writes `changes`, path -> JSON text, or null to delete; `clear` empties the library first.
export const writeLibrary = (changes, clear = false) =>
  run("library", "readwrite", (library) => {
    if (clear) library.clear();
    library.put("1", MARKER);
    for (const [path, text] of changes) text === null ? library.delete(path) : library.put(text, path);
  });

// The world kept, as the zip's bytes and the changes since, or null.
export async function keptWorld() {
  const bytes = await store.get("world").catch(() => null);
  return bytes && { bytes, changes: (await store.get("changes").catch(() => null)) ?? new Map() };
}
