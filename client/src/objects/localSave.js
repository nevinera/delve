// Keeps the world being edited in the browser's IndexedDB, so a reload picks up where you left
// off. One record: the world as zip bytes, plus the editor state that a zip doesn't hold. The
// world's object library lives beside it, in its own store (libraryStore.js).

const DB = "delve3d-editor";
const STORES = ["worlds", "library"];
const STORE = "worlds";
const KEY = "current";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs act(store) in a transaction on one store, resolving with what it returns: a request's
// result, or for a function, what that returns once the transaction is done.
export async function run(mode, act, storeName = STORE) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = act(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(typeof request === "function" ? request() : request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// record: { zip: Uint8Array, pending: ["x,z", ...], dirty: boolean }
export const saveLocal = (record) => run("readwrite", (store) => store.put({ ...record, savedAt: Date.now() }, KEY));

// The saved record, or undefined.
export const loadLocal = () => run("readonly", (store) => store.get(KEY));
