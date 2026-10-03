// What is true in git (see plans/world-editor/README.md, "Two layers"):
// one branch at one commit, every file under the world's directory with
// its blob SHA, and the parsed content of every JSON file. Assets stay as
// SHAs - shown through commit-pinned URLs, never loaded. Immutable;
// replaced wholesale after a Save or a reload.
import {worldDir} from "./worldPaths";

const READ_CONCURRENCY = 6;

export class RepoSnapshot {
  constructor({worldKey, branch, commitSha, files, json}) {
    this.worldKey = worldKey;
    this.branch = branch;
    this.commitSha = commitSha;
    this.files = files; // {path: {sha, size}}
    this.json = json; // {path: parsed} for every .json file
    Object.freeze(this);
  }

  has(path) {
    return path in this.files;
  }

  blobSha(path) {
    return this.files[path]?.sha ?? null;
  }
}

export const isJsonPath = (path) => path.endsWith(".json");

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

// Reads the world's directory at the branch's current head. A world that
// doesn't exist yet gives an empty snapshot (the editor's "create" case).
export async function loadSnapshot(client, branch, worldKey) {
  const commitSha = await client.headSha(branch);
  const {files} = await client.snapshot(commitSha, worldDir(worldKey));
  const jsonPaths = Object.keys(files).filter(isJsonPath);
  const parsed = await mapLimited(jsonPaths, READ_CONCURRENCY, async (path) => {
    const text = await client.readBlobText(files[path].sha);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${path} isn't valid JSON: ${error.message}`);
    }
  });
  const json = Object.fromEntries(jsonPaths.map((path, i) => [path, parsed[i]]));
  return new RepoSnapshot({worldKey, branch, commitSha, files, json});
}
