// Keeps the live draft's changes (WorldDraft#changes) in the browser, so a
// reload or an accidental leave doesn't lose work (see
// plans/world-editor/README.md, "Local drafts"). One record per
// repo + branch + world, with the commit the changes were made against;
// cleared after a successful Save.
//
// The backend is injectable: IndexedDB in the browser (Blobs store
// natively there), an in-memory map in tests.
import {ExistingBlob} from "../../github/commitFiles";

const DB_NAME = "delve-world-editor";
const STORE = "drafts";

export const draftKey = (repo, branch, worldKey) => `${repo}|${branch}|${worldKey}`;

function encodeValue(value) {
  return value instanceof ExistingBlob ? {existingBlobSha: value.sha} : value;
}

function decodeValue(value) {
  return value && typeof value === "object" && "existingBlobSha" in value ? new ExistingBlob(value.existingBlobSha) : value;
}

export function memoryBackend() {
  const records = new Map();
  return {
    get: async (key) => records.get(key),
    put: async (key, record) => void records.set(key, record),
    delete: async (key) => void records.delete(key),
  };
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function indexedDbBackend() {
  let db = null;
  async function open() {
    if (!db) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      db = await request(req);
    }
    return db;
  }
  async function run(mode, fn) {
    const store = (await open()).transaction(STORE, mode).objectStore(STORE);
    return request(fn(store));
  }
  return {
    get: (key) => run("readonly", (store) => store.get(key)),
    put: (key, record) => run("readwrite", (store) => store.put(record, key)),
    delete: (key) => run("readwrite", (store) => store.delete(key)),
  };
}

export function createDraftStore(backend = indexedDbBackend()) {
  return {
    // Stores the draft's changes, or clears the record when there are none.
    async save(key, draft) {
      if (!draft.hasChanges) return backend.delete(key);
      const changes = Object.entries(draft.changes()).map(([path, value]) => [path, encodeValue(value)]);
      return backend.put(key, {baseCommitSha: draft.snapshot.commitSha, savedAt: new Date().toISOString(), changes});
    },

    // {baseCommitSha, savedAt, changes} (changes ready for
    // WorldDraft#applyChanges), or null.
    async load(key) {
      const record = await backend.get(key);
      if (!record) return null;
      return {...record, changes: Object.fromEntries(record.changes.map(([path, value]) => [path, decodeValue(value)]))};
    },

    clear: (key) => backend.delete(key),
  };
}
