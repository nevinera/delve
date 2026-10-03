// Branch-aware reads for the world editor (see plans/world-editor/): list
// and create branches, and read a directory pinned to one commit. Unlike
// GithubClient (which always reads the default branch's latest state),
// everything here is addressed by commit or blob SHA, so one load is
// internally consistent even if the branch moves meanwhile, and files are
// read through the blob API (no 1MB Contents API cap).
import {fetchToken, GithubAuthError} from "./token";

export {GithubAuthError};

const GITHUB_API = "https://api.github.com";

function decodeBase64(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export class BranchClient {
  constructor() {
    this._auth = null;
  }

  async _getAuth() {
    if (!this._auth) this._auth = await fetchToken();
    return this._auth;
  }

  async _get(path) {
    const {token, repo_full_name: repo} = await this._getAuth();
    const res = await fetch(`${GITHUB_API}/repos/${repo}${path}`, {
      cache: "no-store",
      headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GitHub API error ${res.status} for ${path}: ${body.message ?? res.statusText}`);
    }
    return res.json();
  }

  async repo() {
    return (await this._getAuth()).repo_full_name;
  }

  async defaultBranch() {
    return (await this._get("")).default_branch;
  }

  async listBranches() {
    const names = [];
    for (let page = 1; ; page++) {
      const batch = (await this._get(`/branches?per_page=100&page=${page}`)) ?? [];
      names.push(...batch.map((b) => b.name));
      if (batch.length < 100) return names;
    }
  }

  // Creates `name` at the default branch's head.
  async createBranch(name) {
    const {token, repo_full_name: repo} = await this._getAuth();
    const source = await this._get(`/git/ref/heads/${await this.defaultBranch()}`);
    const res = await fetch(`${GITHUB_API}/repos/${repo}/git/refs`, {
      method: "POST",
      cache: "no-store",
      headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"},
      body: JSON.stringify({ref: `refs/heads/${name}`, sha: source.object.sha}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Couldn't create branch ${name}: ${body.message ?? res.statusText}`);
    }
  }

  async headSha(branch) {
    const ref = await this._get(`/git/ref/heads/${branch}`);
    if (!ref) throw new Error(`Branch ${branch} doesn't exist`);
    return ref.object.sha;
  }

  // Every file under `dir` at `commitSha`: {commitSha, files: {path: {sha,
  // size}}}, paths repo-relative. An absent dir gives no files.
  async snapshot(commitSha, dir) {
    const commit = await this._get(`/git/commits/${commitSha}`);
    let treeSha = commit.tree.sha;
    for (const segment of dir.split("/")) {
      const tree = await this._get(`/git/trees/${treeSha}`);
      const entry = tree.tree.find((e) => e.path === segment && e.type === "tree");
      if (!entry) return {commitSha, files: {}};
      treeSha = entry.sha;
    }
    const tree = await this._get(`/git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) throw new Error(`${dir} has too many files to list in one request`);
    const files = {};
    for (const entry of tree.tree) {
      if (entry.type === "blob") files[`${dir}/${entry.path}`] = {sha: entry.sha, size: entry.size};
    }
    return {commitSha, files};
  }

  async readBlobBytes(blobSha) {
    const blob = await this._get(`/git/blobs/${blobSha}`);
    if (!blob) throw new Error(`Blob ${blobSha} not found`);
    return decodeBase64(blob.content);
  }

  async readBlobText(blobSha) {
    return new TextDecoder("utf-8").decode(await this.readBlobBytes(blobSha));
  }

  // Displayable URL for an asset as of a commit. Commit URLs never change,
  // unlike branch URLs, which raw.githubusercontent.com caches for minutes.
  async rawUrl(commitSha, path) {
    return `https://raw.githubusercontent.com/${await this.repo()}/${commitSha}/${path}`;
  }
}
