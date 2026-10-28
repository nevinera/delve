import { strFromU8 } from "fflate";
import { blobSha } from "../github/github.js";
import { plateAt, tilesInPlate } from "./plates.js";
import { World } from "./world.js";

// Worlds kept in GitHub repos. The editor opens one from `?from=github/owner/repo`, at its default
// branch's latest commit. Its source says where it came from: { repo, branch, commitSha, shas },
// with shas giving each file's blob sha at that commit, so saving can tell what changed and
// opening it again only downloads what did.

// The repo a `from` parameter names, or null.
export function fromRepo(from) {
  return from?.match(/^github\/([\w.-]+\/[\w.-]+)$/)?.[1] ?? null;
}

export const sameRepo = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();

// The world at the head of the repo's default branch, with its source. A repo with no commits
// gives an empty world. Files the kept world ({ world, source }) already holds at the same blob
// sha aren't downloaded again; for a plate, that's the kept world's tiles in it. Plates are split
// into tiles (world.js unpack), on `pool` if given.
export async function loadFromGithub(client, { kept = null, onProgress, pool } = {}) {
  const branch = await client.defaultBranch();
  const commitSha = await client.headSha(branch);
  const source = { repo: client.repo, branch, commitSha, shas: {} };
  if (!commitSha) return { world: World.empty(), source };

  const listed = await client.files(commitSha);
  const keptShas = sameRepo(kept?.source?.repo, client.repo) ? kept.source.shas : {};
  const files = new Map();
  const missing = [];
  for (const [path, { sha }] of Object.entries(listed)) {
    source.shas[path] = sha;
    const plate = keptShas[path] === sha && plateAt(path);
    const tiles = plate ? tilesInPlate(kept.world.files, plate) : [];
    if (tiles.length) for (const tile of tiles) files.set(tile, kept.world.files.get(tile));
    else if (keptShas[path] === sha && kept.world.files.has(path)) files.set(path, kept.world.files.get(path));
    else missing.push(path);
  }
  const bytes = await client.readAll(missing.map((path) => listed[path].sha), onProgress);
  missing.forEach((path, i) => files.set(path, bytes[i]));
  const world = World.fromFiles(files, client.repo.split("/")[1]);
  await world.unpack({ pool });
  return { world, source };
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
const TEXT = /\.(plate|json|md|txt)$/;
const shas = new WeakMap(); // file bytes -> blob sha

// What the world would store now, against what was there when it was opened or last saved
// (source): { stored, shas, changes }, shas each stored file's blob sha, and changes { path: text,
// bytes or null } for each file that's new, different or gone.
export async function storedChanges(world, source, { pool, onProgress } = {}) {
  const stored = await world.stored({ pool, onProgress });
  const next = {};
  const changes = {};
  for (const [path, bytes] of stored) {
    if (!shas.has(bytes)) shas.set(bytes, await blobSha(bytes));
    next[path] = shas.get(bytes);
    if (source.shas[path] !== next[path]) changes[path] = TEXT.test(path) ? strFromU8(bytes) : bytes;
  }
  for (const path of Object.keys(source.shas)) if (!(path in next)) changes[path] = null;
  return { stored, shas: next, changes };
}

// Saves the world to the branch it was opened from (source, as loadFromGithub gives it) as one
// commit: the files that differ from what was there, and deletions of files no longer in it.
// Refuses with BranchMoved if the branch has moved on. Returns the new source, or null when
// nothing changed. onProgress({ stage, done, total }) hears how packing and sending go, and
// log(message) each step as it's done.
export async function saveToGithub(client, world, source, { message, pool, onProgress, log = () => {} } = {}) {
  if (!source.commitSha) throw new Error(`${client.repo} has no commits yet: add one on GitHub (a README will do), then open it again`);
  log(`Checking ${source.branch} hasn't moved on since you opened it...`);
  if ((await client.headSha(source.branch)) !== source.commitSha) throw new BranchMoved(client.repo, source.branch);
  const { stored, shas: next, changes } = await storedChanges(world, source, { pool, onProgress: (p) => onProgress?.({ stage: "packing", ...p }) });
  const paths = Object.keys(changes);
  const bytes = paths.reduce((sum, path) => sum + (stored.get(path)?.length ?? 0), 0);
  log(`Packed ${stored.size} files: ${paths.length} changed (${fileSize(bytes)}), ${paths.filter((p) => changes[p] === null).length} gone.`);
  if (!paths.length) return null;
  const commitSha = await client.commit(changes, { message, branch: source.branch, parentSha: source.commitSha, onProgress: (p) => onProgress?.({ stage: "sending", ...p }) });
  log(`Committed ${commitSha.slice(0, 7)} to ${source.branch}.`);
  return { ...source, commitSha, shas: next };
}

// A size for people to read.
export const fileSize = (bytes) => (bytes < 1e3 ? `${bytes} bytes` : bytes < 1e6 ? `${(bytes / 1e3).toFixed(1)} KB` : `${(bytes / 1e6).toFixed(1)} MB`);

// Published versions are tags named v1, v2 and so on, each on a commit that passed the validator
// (world/validate.js). The newest version tag, as { name, sha, number }, or null.
export function latestVersion(tags) {
  let latest = null;
  for (const tag of tags) {
    const m = /^v(\d+)$/.exec(tag.name);
    if (m && (!latest || Number(m[1]) > latest.number)) latest = { ...tag, number: Number(m[1]) };
  }
  return latest;
}

// The name the next published version gets unless you give another.
export const nextVersion = (tags) => `v${(latestVersion(tags)?.number ?? 0) + 1}`;

// What's changed between two commits' files ({ path: { sha, size } }, as GithubClient.files
// gives them, or { path: sha }): { files, bytes }, bytes what the new and changed files weigh.
export function delta(before, after, sizes = {}) {
  const sha = (entry) => (typeof entry === "string" ? entry : entry?.sha);
  let files = 0;
  let bytes = 0;
  for (const [path, entry] of Object.entries(after)) {
    if (sha(before[path]) === sha(entry)) continue;
    files++;
    bytes += entry?.size ?? sizes[path] ?? 0;
  }
  for (const path of Object.keys(before)) if (!(path in after)) files++;
  return { files, bytes };
}

// Adds the world to your list on the server, or marks it opened again.
export async function recordOpened(repo, name) {
  const res = await fetch("/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content },
    body: JSON.stringify({ repo, name }),
  });
  if (!res.ok) throw new Error(`the server said ${res.status}`);
}
