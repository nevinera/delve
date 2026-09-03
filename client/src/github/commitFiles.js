// Commits any number of files - JSON objects and/or uploaded File/Blob
// assets - to the user's connected content repo as a single atomic commit,
// entirely from the browser (never through the Rails backend). Uses
// GitHub's Git Data API (blob -> tree -> commit -> ref), not the Contents
// API, specifically because it needs no per-file "does this already exist"
// check: a tree entry at a given path either already exists in the base
// tree (and gets replaced) or doesn't (and gets added) - the same call
// handles both create and update uniformly. The token comes from
// GET /github/token (see Github::ConnectionsController#token), which
// refreshes it server-side as needed.

const GITHUB_API = "https://api.github.com";

// Thrown when /github/token reports the user isn't connected, or needs to
// reauthorize - `redirectUrl` is where the caller should send them.
export class GithubAuthError extends Error {
  constructor(code, redirectUrl) {
    super(`GitHub authorization required (${code})`);
    this.name = "GithubAuthError";
    this.code = code;
    this.redirectUrl = redirectUrl;
  }
}

async function fetchToken() {
  const res = await fetch("/github/token");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GithubAuthError(body.error ?? "not_connected", body.connect_url ?? body.reauth_url ?? null);
  }
  return res.json();
}

async function githubRequest(token, path, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? {"Content-Type": "application/json"} : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub API error ${res.status} for ${path}: ${body.message ?? res.statusText}`);
  }
  return res.json();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip the "data:...;base64," prefix
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// A file's content may be a plain object (serialized as pretty-printed
// JSON), a string (written as-is), or a File/Blob (an uploaded asset,
// base64-encoded).
async function encodeContent(content) {
  if (content instanceof Blob) return {content: await readFileAsBase64(content), encoding: "base64"};
  if (typeof content === "string") return {content, encoding: "utf-8"};
  return {content: JSON.stringify(content, null, 2), encoding: "utf-8"};
}

async function createBlob(token, repo, path, content) {
  const {content: encoded, encoding} = await encodeContent(content);
  const blob = await githubRequest(token, `/repos/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({content: encoded, encoding}),
  });
  return {path, sha: blob.sha};
}

// filesByPath: {"abilities/firebolt.json": {...}, "graphics/animations/firebolt.png": File}
// Returns {commitSha, branch} once the branch has been fast-forwarded to
// the new commit. Throws (without partially applying anything visible on
// the branch - only the ref update actually moves it) if another commit
// landed on the branch first, since that's not something to silently
// force past.
export async function commitFiles(filesByPath, {message}) {
  const paths = Object.keys(filesByPath);
  if (paths.length === 0) throw new Error("commitFiles: no files given");

  const {token, repo_full_name: repo} = await fetchToken();

  const repoInfo = await githubRequest(token, `/repos/${repo}`);
  const branch = repoInfo.default_branch;

  const ref = await githubRequest(token, `/repos/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;

  const baseCommit = await githubRequest(token, `/repos/${repo}/git/commits/${baseCommitSha}`);

  const blobs = await Promise.all(paths.map((path) => createBlob(token, repo, path, filesByPath[path])));

  const tree = await githubRequest(token, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: blobs.map(({path, sha}) => ({path, mode: "100644", type: "blob", sha})),
    }),
  });

  const commit = await githubRequest(token, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({message, tree: tree.sha, parents: [baseCommitSha]}),
  });

  await githubRequest(token, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({sha: commit.sha}),
  });

  return {commitSha: commit.sha, branch};
}
