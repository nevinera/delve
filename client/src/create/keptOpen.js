import { strFromU8, unzipSync } from "fflate";
import { isLibraryPath } from "../objects/libraryStore.js";
import { GithubClient } from "../github/github.js";
import { loadRepo, recordOpened, sameRepo } from "./repo.js";
import { readLibrary, store, writeLibrary } from "./store.js";

// Opening a GitHub repo into the world this browser keeps (store.js), and dropping what's changed
// since, from any page that edits the world: /create, /objects and /classes share the one kept
// world and only download files whose blob sha has changed.

const LIBRARY_CHANNEL = "delve3d-create-library";

const tellLibraryChanged = () => {
  const channel = new BroadcastChannel(LIBRARY_CHANNEL);
  channel.postMessage("changed");
  channel.close();
};

// The kept world's own files, without its changes: a zip's bytes, or a repo's files as a Map, as
// path -> bytes under the world's root.
export function baseFiles(base) {
  let files = base instanceof Map ? [...base] : Object.entries(unzipSync(base));
  if (!files.some(([path]) => path === "world.json")) {
    const top = files[0]?.[0].split("/")[0];
    files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  }
  return new Map(files);
}

// A world's library files as the library store holds them: path -> JSON text.
export function libraryRecords(files) {
  const out = new Map();
  for (const [path, bytes] of files) if (isLibraryPath(path)) out.set(path, JSON.stringify(JSON.parse(strFromU8(bytes))));
  return out;
}

// How many of the library's paths differ between two sets of records.
export function recordsDiffering(a, b) {
  let count = 0;
  for (const [path, text] of a) if (b.get(path) !== text) count++;
  for (const path of b.keys()) if (!a.has(path)) count++;
  return count;
}

// `changes` (path -> bytes) without the library's, for dropping those alone.
export const withoutLibrary = (changes) => new Map([...changes].filter(([path]) => !isLibraryPath(path)));

// What's to do about opening a repo whose head is `head`, given what's kept: "keep" when that's the
// commit kept already, "ask" when opening it would lose local changes, or "load".
export function openPlan({ kept, source, changes, repo, head }) {
  if (kept && sameRepo(source?.repo, repo) && source.commitSha === head) return "keep";
  return kept && changes?.size ? "ask" : "load";
}

// Opens the head of `repo` in place of the world kept here. Returns the files when it replaced what
// was kept, or null when it didn't: that commit's kept already, or `confirm` said no. Throws when it
// can't. confirm(message) decides about losing changes. onProgress({ done, total }) hears as files
// come down.
export async function openRepoKept(repo, { confirm, onProgress, client = new GithubClient(repo) } = {}) {
  const kept = await store.get("world").catch(() => null);
  const changes = await store.get("changes").catch(() => null);
  const source = await store.get("source").catch(() => null);
  const head = await client.headSha(await client.defaultBranch());
  const plan = openPlan({ kept, source, changes, repo, head });
  if (plan === "keep") return null;
  const lose = source && !sameRepo(source.repo, repo) ? `${source.repo}'s` : "its";
  if (plan === "ask" && !confirm(`Open ${repo} from GitHub? It replaces the world kept in this browser, and ${lose} changes are lost unless you've saved or downloaded them.`)) return null;
  const sameKept = kept instanceof Map && sameRepo(source?.repo, repo) ? { files: kept, source } : null;
  const loaded = await loadRepo(client, { kept: sameKept, onProgress });
  await store.set("world", loaded.files);
  await store.delete("changes");
  await store.set("source", loaded.source);
  const { name } = JSON.parse(strFromU8(loaded.files.get("world.json")));
  recordOpened(repo, name).catch((e) => console.error("couldn't add the world to your list", e));
  return loaded;
}

// Makes the library store hold just what `files` have, and tells open pages.
export async function replaceLibrary(files) {
  await writeLibrary(libraryRecords(files), true);
  tellLibraryChanged();
}

// How many objects, classes and other library files differ from those the kept world was opened or
// last saved with.
export async function localLibraryChanges() {
  const kept = await store.get("world").catch(() => null);
  const stored = await readLibrary().catch(() => null);
  if (!kept || !stored) return 0;
  return recordsDiffering(libraryRecords(baseFiles(kept)), stored);
}

// Puts the library back to what the kept world was opened or last saved with, leaving its other
// changes alone.
export async function dropLibraryChanges() {
  const kept = await store.get("world");
  const changes = await store.get("changes").catch(() => null);
  if (changes) await store.set("changes", withoutLibrary(changes));
  await replaceLibrary(baseFiles(kept));
}
