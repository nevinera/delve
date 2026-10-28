// The browser's one way to GitHub: list a repo's files at a commit, read them, and commit a set of
// files, straight to GitHub's API with the token Rails hands out at /github/token. Reads are
// pinned to a commit, so one load stays consistent even if the branch moves meanwhile, and go
// through the blob API, which has no 1MB cap.

const GITHUB_API = "https://api.github.com";
// A token is fetched again this long before it expires.
const TOKEN_MARGIN_MS = 60_000;
// Blobs go up and come down a few at a time: a world can have hundreds of tiles.
const BLOB_CONCURRENCY = 4;
const READ_CONCURRENCY = 8;

// Thrown when /github/token says you aren't connected or must authorize again. `redirectUrl` is
// where to send you.
export class GithubAuthError extends Error {
  constructor(code, redirectUrl) {
    super(`GitHub authorization required (${code})`);
    this.name = "GithubAuthError";
    this.code = code;
    this.redirectUrl = redirectUrl;
  }
}

export async function fetchToken() {
  const res = await fetch("/github/token", { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GithubAuthError(body.error ?? "not_connected", body.connect_url ?? body.reauth_url ?? null);
  }
  return res.json();
}

export function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(base64) {
  return Uint8Array.from(atob(base64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
}

// Runs act(item) on every item, `limit` at a time, telling onProgress({ done, total }) as each
// finishes. Resolves with the results in order.
export async function pool(items, limit, act, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await act(items[index]);
      onProgress?.({ done: ++done, total: items.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// A file already in git, by blob sha: committed at a path without uploading it again.
export class ExistingBlob {
  constructor(sha) {
    this.sha = sha;
  }
}

// One repo, `owner/name`.
export class GithubClient {
  constructor(repo) {
    this.repo = repo;
    this._auth = null;
  }

  async _token() {
    if (!this._auth || Date.parse(this._auth.expires_at) - Date.now() < TOKEN_MARGIN_MS) this._auth = await fetchToken();
    return this._auth.token;
  }

  // GitHub's answer to one request. A GET gives null for a 404, and for the 409 GitHub gives
  // for anything in a repo with no commits. `no-store`: GitHub lets the browser
  // cache some of these for a minute, and a stale branch head breaks the next commit.
  async _request(path, { method = "GET", body } = {}) {
    const res = await fetch(`${GITHUB_API}/repos/${this.repo}${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${await this._token()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body && JSON.stringify(body),
    });
    if (method === "GET" && (res.status === 404 || res.status === 409)) return null;
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${error.message ?? res.statusText}`);
    }
    return res.json();
  }

  async _get(path, what) {
    const found = await this._request(path);
    if (!found) throw new Error(`${what} not found in ${this.repo}`);
    return found;
  }

  async defaultBranch() {
    return (await this._get("", "The repo")).default_branch;
  }

  // The commit a branch points at, or null when there's no such branch, as in a repo with no
  // commits yet.
  async headSha(branch) {
    return (await this._request(`/git/ref/heads/${encodeURIComponent(branch)}`))?.object.sha ?? null;
  }

  // Every file under `dir` at a commit, as { path: { sha, size } } with repo-relative paths. The
  // whole repo when `dir` is empty, and nothing when it doesn't exist. Walks down to `dir` one
  // level at a time, then lists it in one request.
  async files(commitSha, dir = "") {
    let treeSha = (await this._get(`/git/commits/${commitSha}`, `Commit ${commitSha}`)).tree.sha;
    const segments = dir.split("/").filter(Boolean);
    for (const segment of segments) {
      const tree = await this._get(`/git/trees/${treeSha}`, `Tree ${treeSha}`);
      const entry = tree.tree.find((e) => e.path === segment && e.type === "tree");
      if (!entry) return {};
      treeSha = entry.sha;
    }
    const tree = await this._get(`/git/trees/${treeSha}?recursive=1`, `Tree ${treeSha}`);
    if (tree.truncated) throw new Error(`${dir || this.repo} has too many files to list in one request`);
    const prefix = segments.length ? `${segments.join("/")}/` : "";
    const files = {};
    for (const entry of tree.tree) {
      if (entry.type === "blob") files[`${prefix}${entry.path}`] = { sha: entry.sha, size: entry.size };
    }
    return files;
  }

  async readBytes(blobSha) {
    return fromBase64((await this._get(`/git/blobs/${blobSha}`, `Blob ${blobSha}`)).content);
  }

  async readText(blobSha) {
    return new TextDecoder().decode(await this.readBytes(blobSha));
  }

  // Several blobs' bytes, in order.
  readAll(blobShas, onProgress) {
    return pool(blobShas, READ_CONCURRENCY, (sha) => this.readBytes(sha), onProgress);
  }

  // One tree entry. null deletes the path, an ExistingBlob reuses its sha, bytes are uploaded as
  // a blob first, and text goes into the tree as it is.
  async _entry(path, content) {
    const entry = { path, mode: "100644", type: "blob" };
    if (content === null) return { ...entry, sha: null };
    if (content instanceof ExistingBlob) return { ...entry, sha: content.sha };
    if (typeof content === "string") return { ...entry, content };
    const bytes = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
    const blob = await this._request("/git/blobs", { method: "POST", body: { content: toBase64(bytes), encoding: "base64" } });
    return { ...entry, sha: blob.sha };
  }


  // Commits `files`, { path: content }, to `branch` as one commit on `parentSha` and moves the
  // branch to it. Content is text, bytes (Uint8Array or Blob), an ExistingBlob, or null to
  // delete the path. Fails without touching the branch if it has moved past `parentSha`, so a
  // save never silently drops someone else's commit. Returns the new commit's sha.
  async commit(files, { message, branch, parentSha, onProgress }) {
    if (Object.keys(files).length === 0) throw new Error("Nothing to commit");
    const base = await this._get(`/git/commits/${parentSha}`, `Commit ${parentSha}`);
    const entries = await pool(Object.keys(files), BLOB_CONCURRENCY, (path) => this._entry(path, files[path]), onProgress);
    const tree = await this._request("/git/trees", { method: "POST", body: { base_tree: base.tree.sha, tree: entries } });
    const commit = await this._request("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [parentSha] } });
    await this._request(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: { sha: commit.sha } });
    return commit.sha;
  }
}
