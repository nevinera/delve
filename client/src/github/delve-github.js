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

export class GithubClient {
  constructor() {
    this._auth = null;
  }

  async _getAuth() {
    if (!this._auth) this._auth = await fetchToken();
    return this._auth;
  }

  // Returns a file's decoded text content, or null if it doesn't exist -
  // same "doesn't exist yet" shape Github::ContentClient#file_content's
  // NotFoundError represents server-side, just as a plain return value
  // rather than an exception (the normal case for a brand-new key, not an
  // error worth throwing over).
  async fetchFile(path) {
    const {token, repo_full_name: repo} = await this._getAuth();
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GitHub API error ${res.status} for ${path}: ${body.message ?? res.statusText}`);
    }
    const data = await res.json();
    return decodeBase64Content(data.content);
  }
}
