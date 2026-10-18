// Reads the shared library (anything in the repo outside worlds/) at the
// draft's commit, the way GithubClient reads the default branch - so the
// existing power import sources (powerSources.js) and $ref expansion work
// against it unchanged. Each top-level directory is listed once, on first
// use; file contents are cached.
//
// The library can instead be another repo (external, read through a
// client for that repo, at its own commit). It's only ever read: imports
// copy from it into the world.
import {ExistingBlob} from "../../github/commitFiles";

const MIME_TYPES = {png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", json: "application/json"};

function mimeType(path) {
  return MIME_TYPES[path.split(".").pop().toLowerCase()] ?? "application/octet-stream";
}

export class LibraryReader {
  constructor(client, commitSha, {repo = null, external = false} = {}) {
    this.client = client;
    this.commitSha = commitSha;
    this.repo = repo;
    this.external = external;
    this._dirs = new Map();
    this._texts = new Map();
  }

  _top(path) {
    const top = path.split("/")[0];
    if (!this._dirs.has(top)) this._dirs.set(top, this.client.snapshot(this.commitSha, top).then(({files}) => files));
    return this._dirs.get(top);
  }

  // Every file path under dir (repo-relative), sorted.
  async listDirectory(dir) {
    const files = await this._top(dir);
    return Object.keys(files).filter((path) => path.startsWith(`${dir}/`)).sort();
  }

  async blobSha(path) {
    return (await this._top(path))[path]?.sha ?? null;
  }

  // What to write into the world to copy the file at path, or null if it
  // doesn't exist: the same git blob from this repo, or the downloaded
  // bytes from another (git can't share a blob across repos).
  async copy(path) {
    const sha = await this.blobSha(path);
    if (!sha) return null;
    if (!this.external) return new ExistingBlob(sha, path);
    return new Blob([await this.client.readBlobBytes(sha)], {type: mimeType(path)});
  }

  // The file's text, or null if it doesn't exist.
  async fetchFile(path) {
    if (!this._texts.has(path)) {
      this._texts.set(path, this.blobSha(path).then((sha) => (sha ? this.client.readBlobText(sha) : null)));
    }
    return this._texts.get(path);
  }
}

// The reader for client's shared library at commitSha (the draft's
// commit): the connected repo itself, or, when the user picked another
// library repo, that repo at its default branch's head.
export async function openLibrary(client, commitSha) {
  const repo = await client.repo();
  const libraryRepo = await client.libraryRepo();
  if (libraryRepo === repo) return new LibraryReader(client, commitSha, {repo});
  const other = client.forRepo(libraryRepo);
  const head = await other.headSha(await other.defaultBranch());
  return new LibraryReader(other, head, {repo: libraryRepo, external: true});
}
