// Keeps the world being edited in the browser's IndexedDB, so a reload picks up where you left
// off. One record: the world as zip bytes, plus the editor state that a zip doesn't hold.

const DB = "delve3d-editor";
const STORE = "worlds";
const KEY = "current";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, act) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
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
