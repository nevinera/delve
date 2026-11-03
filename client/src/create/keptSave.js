import { GithubClient } from "../github/github.js";
import { saveRepo } from "./repo.js";
import { store } from "./store.js";

// Saving part of the world /create keeps in this browser (store.js) straight to its GitHub repo,
// from a page other than /create. A commit moves the branch, so the kept world's source moves with
// it, and open /create tabs hear of it, or their next save would be refused.

const CHANNEL = "delve3d-create-source";

// The repo and commit the kept world came from, or null for a world from a zip.
export const keptSource = () => store.get("source").catch(() => null);

// Commits the paths `only` picks of `files` (path -> bytes) on the kept world's branch. Returns the
// new source, or null when none of them changed.
export async function saveKept(files, only, { message, log, onProgress, client } = {}) {
  const source = await keptSource();
  if (!source) throw new Error("this world isn't from GitHub");
  const next = await saveRepo(client ?? new GithubClient(source.repo), files, source, { only, message, log, onProgress });
  if (!next) return null;
  // Opening the repo again reuses kept files whose sha hasn't changed, so they have to match.
  const kept = await store.get("world");
  if (kept instanceof Map) {
    for (const path of kept.keys()) if (only(path) && !files.has(path)) kept.delete(path);
    for (const [path, bytes] of files) if (only(path)) kept.set(path, bytes);
    await store.set("world", kept);
  }
  await store.set("source", next);
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("saved");
  channel.close();
  return next;
}

// hear(source) hears that another page saved to the repo.
export function onSourceSaved(hear) {
  new BroadcastChannel(CHANNEL).onmessage = async () => hear(await keptSource());
}
