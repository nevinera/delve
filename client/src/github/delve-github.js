// The one place every editor should reach through for direct-to-GitHub
// reads (see plans/editor-git.md) - a stateful GithubClient instance,
// created once per editor page mount, caching the auth token (and
// repo_full_name) across calls instead of re-hitting /github/token on every
// read like the older stateless helpers (token.js, commitFiles.js,
// fetchFilesBatch.js) do. New read capabilities land here as editors need
// them - starts with just "fetch one file", the item editor's only need so
// far.
import {fetchToken, GithubAuthError} from "./token";

export {GithubAuthError};

const GITHUB_API = "https://api.github.com";

function decodeBase64Content(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function authHeaders(token) {
  return {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"};
}

export class GithubClient {
  constructor() {
    this._auth = null;
    this._defaultBranch = null;
    // Non-recursive tree fetches, keyed by sha - shared by every
    // listDirectory call on this instance (see its own comment), so
    // resolving overlapping path prefixes (e.g. two editors both walking
    // into "abilities/") only ever costs one request per level, not one
    // per call.
    this._treesBySha = new Map();
  }

  async _getAuth() {
    if (!this._auth) this._auth = await fetchToken();
    return this._auth;
  }

  async _getDefaultBranch(repo, token) {
    if (!this._defaultBranch) {
      const res = await fetch(`${GITHUB_API}/repos/${repo}`, {headers: authHeaders(token)});
      if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching ${repo}: ${res.statusText}`);
      this._defaultBranch = (await res.json()).default_branch;
    }
    return this._defaultBranch;
  }

  async _getTree(repo, token, sha) {
    if (!this._treesBySha.has(sha)) {
      const res = await fetch(`${GITHUB_API}/repos/${repo}/git/trees/${sha}`, {headers: authHeaders(token)});
      if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching tree ${sha}: ${res.statusText}`);
      this._treesBySha.set(sha, (await res.json()).tree ?? []);
    }
    return this._treesBySha.get(sha);
  }

  // Lists every file under a directory, at any depth - the same two-request-
  // per-level-plus-one-recursive-call trick Github::TreeListing uses
  // server-side for index pages (see plans/editor-git.md), just in JS, for
  // an editor's own within-page cross-reference lookups (e.g. "every
  // ability under this class's own abilities/classes/<key>/ folder").
  // Returns paths prefixed with `path` itself, e.g. listDirectory("a/b")
  // might return ["a/b/c.json"]. Empty array if the path doesn't exist.
  async listDirectory(path) {
    const {token, repo_full_name: repo} = await this._getAuth();
    let sha = await this._getDefaultBranch(repo, token);
    for (const segment of path.split("/")) {
      const tree = await this._getTree(repo, token, sha);
      const entry = tree.find((e) => e.path === segment && e.type === "tree");
      if (!entry) return [];
      sha = entry.sha;
    }

    const res = await fetch(`${GITHUB_API}/repos/${repo}/git/trees/${sha}?recursive=1`, {headers: authHeaders(token)});
    if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching tree ${sha}: ${res.statusText}`);
    const entries = (await res.json()).tree ?? [];
    return entries.filter((e) => e.type === "blob").map((e) => `${path}/${e.path}`);
  }

  // Binary assets (images, audio) are served straight from
  // raw.githubusercontent.com rather than fetched/base64'd through the
  // Contents API - the content repo is always public (assets need to play
  // without any auth, in-game), so this URL can go directly into an
  // <img>/<audio> src with no fetch, no CORS concern, and no size ceiling
  // (unlike the Contents API's base64 envelope, capped at 1MB).
  async assetUrl(path) {
    const {token, repo_full_name: repo} = await this._getAuth();
    const branch = await this._getDefaultBranch(repo, token);
    return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  }

  // Returns a file's decoded text content, or null if it doesn't exist -
  // same "doesn't exist yet" shape Github::ContentClient#file_content's
  // NotFoundError represents server-side, just as a plain return value
  // rather than an exception (the normal case for a brand-new key, not an
  // error worth throwing over).
  async fetchFile(path) {
    const {token, repo_full_name: repo} = await this._getAuth();
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {cache: "no-store", headers: authHeaders(token)});
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GitHub API error ${res.status} for ${path}: ${body.message ?? res.statusText}`);
    }
    const data = await res.json();
    return decodeBase64Content(data.content);
  }
}
