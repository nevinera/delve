import { strFromU8, strToU8 } from "fflate";
import { blobSha } from "../github/github.js";

// Worlds kept in GitHub repos. /create opens one from `?from=github/owner/repo`, at its default
// branch's latest commit. Its source says where it came from: { repo, branch, commitSha, shas },
// with shas giving each file's blob sha at that commit, so saving can tell what changed and
// opening it again only downloads what did.

// The repo a `from` parameter names, or null.
export function fromRepo(from) {
  return from?.match(/^github\/([\w.-]+\/[\w.-]+)$/)?.[1] ?? null;
}

export const sameRepo = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();

// A new world's world.json, named `name`.
export const newWorldJson = (name) => strToU8(`${JSON.stringify({ version: 2, name, continents: [{ key: "main", name: "Main" }], dungeons: [] }, null, 2)}\n`);

// The files at the head of the repo's default branch (path -> bytes), with their source. Files
// the kept world ({ files, source }) holds at the same blob sha aren't downloaded again. A repo with
// no world.json (no commits, or only a README, say) gets a new one, named after the repo, beside
// its files. onProgress({ done, total }) hears as each file comes down.
export async function loadRepo(client, { kept = null, onProgress } = {}) {
  const branch = await client.defaultBranch();
  const commitSha = await client.headSha(branch);
  const source = { repo: client.repo, branch, commitSha, shas: {} };
  const files = new Map();
  if (commitSha) {
    const listed = await client.files(commitSha);
    const keptShas = sameRepo(kept?.source?.repo, client.repo) ? kept.source.shas : {};
    const missing = [];
    for (const [path, { sha }] of Object.entries(listed)) {
      source.shas[path] = sha;
      if (keptShas[path] === sha && kept.files.has(path)) files.set(path, kept.files.get(path));
      else missing.push(path);
    }
    const bytes = await client.readAll(missing.map((path) => listed[path].sha), onProgress);
    missing.forEach((path, i) => files.set(path, bytes[i]));
  }
  if (!files.has("world.json")) files.set("world.json", newWorldJson(client.repo.split("/")[1]));
  return { files, source };
}

// Thrown when the branch has moved on since the world was opened, so saving would drop what's
// there.
export class BranchMoved extends Error {
  constructor(repo, branch) {
    super(`${repo} has changed on GitHub since you opened it`);
    this.name = "BranchMoved";
    this.branch = branch;
  }
}

// Files GitHub keeps as text, which go inline in the commit's tree; the rest go up as blobs.
const TEXT = /\.(plate|platter|json|md|txt)$/;
const shas = new WeakMap(); // file bytes -> blob sha

// The world's files (path -> bytes) against what was there when it was opened or last saved
// (source): { shas, changes }, shas each file's blob sha, and changes { path: text, bytes or null }
// for each file that's new, different or gone. With `only`, a test of paths, other paths aren't
// looked at, and keep the shas they had.
export async function repoChanges(files, source, only = () => true) {
  const next = {};
  const changes = {};
  for (const [path, bytes] of files) {
    if (!only(path)) continue;
    if (!shas.has(bytes)) shas.set(bytes, await blobSha(bytes));
    next[path] = shas.get(bytes);
    if (source.shas[path] !== next[path]) changes[path] = TEXT.test(path) ? strFromU8(bytes) : bytes;
  }
  for (const [path, sha] of Object.entries(source.shas)) {
    if (!only(path)) next[path] = sha;
    else if (!next[path]) changes[path] = null;
  }
  return { shas: next, changes };
}

// Saves the world's files to the branch it was opened from as one commit: the files that differ
// from what was there, and deletions of files no longer in it. A repo with no commits gets its
// world.json first, as a commit of its own. Refuses with BranchMoved if the branch has moved on.
// With `only`, a test of paths, the commit holds just those paths, on a repo that has commits.
// Returns the new source, or null when nothing changed. log(message) hears each step.
export async function saveRepo(client, files, source, { message, onProgress, only, log = () => {} } = {}) {
  if (only && !source.commitSha) throw new Error("this repo has no commits yet: save the whole world from /create first");
  log(`Checking ${source.branch} hasn't moved on since you opened it…`);
  if ((await client.headSha(source.branch)) !== source.commitSha) throw new BranchMoved(client.repo, source.branch);
  let { shas: next, changes } = await repoChanges(files, source, only);
  const paths = Object.keys(changes);
  log(`${files.size} files: ${paths.length} changed, ${paths.filter((p) => changes[p] === null).length} gone.`);
  if (!paths.length) return null;
  let parentSha = source.commitSha;
  if (!parentSha) {
    parentSha = await client.firstCommit("world.json", changes["world.json"], { message, branch: source.branch });
    delete changes["world.json"];
    if (!Object.keys(changes).length) return { ...source, commitSha: parentSha, shas: next };
  }
  const commitSha = await client.commit(changes, { message, branch: source.branch, parentSha, onProgress });
  log(`Committed ${commitSha.slice(0, 7)} to ${source.branch}.`);
  return { ...source, commitSha, shas: next };
}

// Published versions are tags named v1, v2 and so on. The newest, as { name, sha, number }, or
// null.
export function latestVersion(tags) {
  let latest = null;
  for (const tag of tags) {
    const m = /^v(\d+)$/.exec(tag.name);
    if (m && (!latest || Number(m[1]) > latest.number)) latest = { ...tag, number: Number(m[1]) };
  }
  return latest;
}

// The name the next published version gets.
export const nextVersion = (tags) => `v${(latestVersion(tags)?.number ?? 0) + 1}`;

// Adds the world to your list on the server, or marks it opened again.
export async function recordOpened(repo, name) {
  const res = await fetch("/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content },
    body: JSON.stringify({ repo, name }),
  });
  if (!res.ok) throw new Error(`the server said ${res.status}`);
}
