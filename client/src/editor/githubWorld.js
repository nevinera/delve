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

// Adds the world to your list on the server, or marks it opened again.
export async function recordOpened(repo, name) {
  const res = await fetch("/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content },
    body: JSON.stringify({ repo, name }),
  });
  if (!res.ok) throw new Error(`the server said ${res.status}`);
}
