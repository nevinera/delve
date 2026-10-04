// Commits any number of files - JSON objects and/or uploaded File/Blob
// assets - to the user's connected content repo as a single atomic commit,
// entirely from the browser (never through the Rails backend). Uses
// GitHub's Git Data API ([blob for binaries ->] tree -> commit -> ref), not the Contents
// API, specifically because it needs no per-file "does this already exist"
// check: a tree entry at a given path either already exists in the base
// tree (and gets replaced) or doesn't (and gets added) - the same call
// handles both create and update uniformly.

import {fetchToken, GithubAuthError} from "./token";

export {GithubAuthError};

const GITHUB_API = "https://api.github.com";

async function githubRequest(token, path, options = {}) {
  // no-store: GitHub's API sends Cache-Control: private, max-age=60 on
  // several of these GET endpoints (notably git/ref/heads/*) - the browser's
  // default fetch caching would happily serve a same-URL GET from cache
  // within that window, which for the ref lookup means building a new
  // commit on a stale parent and then failing the ref update as "not a
  // fast forward" on a second save shortly after the first.
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    cache: "no-store",
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
// JSON), a string (written as-is), or a File/Blob (an uploaded asset).
// Text goes straight into its tree entry as `content` (the create-tree API
// accepts that in place of a blob sha), so only binary assets cost a
// separate POST /git/blobs request - a JSON-only save is the same handful
// of requests however many files it touches.
function textContent(content) {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

// One tree entry: null deletes the path, an ExistingBlob reuses its sha, a
// File/Blob is uploaded first, and anything else is inlined as text.
async function treeEntry(token, repo, path, content) {
  const entry = {path, mode: "100644", type: "blob"};
  if (content === null) return {...entry, sha: null};
  if (content instanceof ExistingBlob) return {...entry, sha: content.sha};
  if (!(content instanceof Blob)) return {...entry, content: textContent(content)};

  const blob = await githubRequest(token, `/repos/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({content: await readFileAsBase64(content), encoding: "base64"}),
  });
  return {...entry, sha: blob.sha};
}

// A file already in git, by blob SHA - committed at a (possibly new) path
// without re-uploading it. The world editor uses this to move a zone's
// images on a rename.
export class ExistingBlob {
  // sourcePath: where the blob already lives in the repo, if that's not
  // otherwise known (e.g. a library asset copied into a world) - for
  // displaying it before it's committed.
  constructor(sha, sourcePath = null) {
    this.sha = sha;
    this.sourcePath = sourcePath;
  }
}

// Uploads run a few at a time - a world save can carry dozens of files,
// some of them multi-megabyte images.
const BLOB_CONCURRENCY = 4;

async function treeEntries(token, repo, filesByPath, onProgress) {
  const paths = Object.keys(filesByPath);
  const results = new Array(paths.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < paths.length) {
      const index = next++;
      const path = paths[index];
      results[index] = await treeEntry(token, repo, path, filesByPath[path]);
      onProgress?.({done: ++done, total: paths.length});
    }
  }
  await Promise.all(Array.from({length: Math.min(BLOB_CONCURRENCY, paths.length)}, worker));
  return results;
}

// filesByPath: {"abilities/firebolt.json": {...}, "graphics/animations/firebolt.png": File}
// A null value deletes that path instead (it must already exist on the
// branch - GitHub rejects deleting a missing path).
// Returns {commitSha, branch} once the branch has been fast-forwarded to
// the new commit. Throws (without partially applying anything visible on
// the branch - only the ref update actually moves it) if another commit
// landed on the branch first, since that's not something to silently
// force past.
//
// Options beyond message: `branch` (default: the repo's default branch),
// `parentSha` (build on this commit rather than the branch's current head -
// the world editor pins its reads to one commit, so a branch that moved
// since then fails the ref update instead of silently absorbing it), and
// `onProgress({done, total})` as blobs upload.
export async function commitFiles(filesByPath, {message, branch: requestedBranch, parentSha, onProgress}) {
  const paths = Object.keys(filesByPath);
  if (paths.length === 0) throw new Error("commitFiles: no files given");

  const {token, repo_full_name: repo} = await fetchToken();

  const branch = requestedBranch ?? (await githubRequest(token, `/repos/${repo}`)).default_branch;

  const baseCommitSha = parentSha ?? (await githubRequest(token, `/repos/${repo}/git/ref/heads/${branch}`)).object.sha;

  const baseCommit = await githubRequest(token, `/repos/${repo}/git/commits/${baseCommitSha}`);

  const entries = await treeEntries(token, repo, filesByPath, onProgress);

  const tree = await githubRequest(token, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: entries,
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
