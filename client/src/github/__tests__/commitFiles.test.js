import {describe, it, expect, vi, beforeEach} from "vitest";
import {commitFiles, GithubAuthError} from "../commitFiles";

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return {ok, status, statusText: "", json: () => Promise.resolve(body)};
}

// Routes each fetch call by URL (and method, for the two /git/... POSTs
// that share a resource-ish shape) to a canned response, and records every
// call for assertions.
function stubGithubApi() {
  const calls = [];
  const fetchMock = vi.fn((url, options = {}) => {
    calls.push({url, options});
    const method = options.method ?? "GET";

    if (url === "/github/token") {
      return Promise.resolve(jsonResponse({token: "gho_test", expires_at: "2026-01-01T00:00:00Z", repo_full_name: "nevinera/delve-content"}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content") {
      return Promise.resolve(jsonResponse({default_branch: "main"}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/ref/heads/main") {
      return Promise.resolve(jsonResponse({object: {sha: "base-commit-sha"}}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/commits/base-commit-sha") {
      return Promise.resolve(jsonResponse({tree: {sha: "base-tree-sha"}}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/blobs" && method === "POST") {
      const body = JSON.parse(options.body);
      return Promise.resolve(jsonResponse({sha: `blob-sha-for-${body.content.slice(0, 8)}`}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/trees" && method === "POST") {
      return Promise.resolve(jsonResponse({sha: "new-tree-sha"}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/commits" && method === "POST") {
      return Promise.resolve(jsonResponse({sha: "new-commit-sha"}));
    }
    if (url === "https://api.github.com/repos/nevinera/delve-content/git/refs/heads/main" && method === "PATCH") {
      return Promise.resolve(jsonResponse({}));
    }
    throw new Error(`unstubbed request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {fetchMock, calls};
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("commitFiles", () => {
  it("throws without making any request when given no files", async () => {
    const {fetchMock} = stubGithubApi();
    await expect(commitFiles({}, {message: "empty"})).rejects.toThrow("no files given");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("raises GithubAuthError with the connect_url when the user isn't connected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({error: "not_connected", connect_url: "/github/connect"}, false, 401)));

    const error = await commitFiles({"abilities/x.json": {name: "X"}}, {message: "m"}).catch((e) => e);
    expect(error).toBeInstanceOf(GithubAuthError);
    expect(error.code).toEqual("not_connected");
    expect(error.redirectUrl).toEqual("/github/connect");
  });

  it("raises GithubAuthError with the reauth_url when reauth is required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({error: "reauth_required", reauth_url: "/github/reauth"}, false, 401)));

    const error = await commitFiles({"abilities/x.json": {name: "X"}}, {message: "m"}).catch((e) => e);
    expect(error).toBeInstanceOf(GithubAuthError);
    expect(error.redirectUrl).toEqual("/github/reauth");
  });

  it("commits a JSON object and an uploaded file together as a single commit", async () => {
    const {calls} = stubGithubApi();
    const file = new File(["fake-png-bytes"], "icon.png", {type: "image/png"});

    const result = await commitFiles(
      {
        "abilities/firebolt.json": {name: "Firebolt", castTime: null},
        "graphics/icons/firebolt.png": file,
      },
      {message: "Update firebolt"}
    );

    expect(result).toEqual({commitSha: "new-commit-sha", branch: "main"});

    const urls = calls.map((c) => c.url);
    expect(urls).toEqual([
      "/github/token",
      "https://api.github.com/repos/nevinera/delve-content",
      "https://api.github.com/repos/nevinera/delve-content/git/ref/heads/main",
      "https://api.github.com/repos/nevinera/delve-content/git/commits/base-commit-sha",
      "https://api.github.com/repos/nevinera/delve-content/git/blobs",
      "https://api.github.com/repos/nevinera/delve-content/git/blobs",
      "https://api.github.com/repos/nevinera/delve-content/git/trees",
      "https://api.github.com/repos/nevinera/delve-content/git/commits",
      "https://api.github.com/repos/nevinera/delve-content/git/refs/heads/main",
    ]);
  });

  it("JSON-encodes a plain object as pretty-printed utf-8, not base64", async () => {
    const {calls} = stubGithubApi();
    await commitFiles({"abilities/firebolt.json": {name: "Firebolt"}}, {message: "m"});

    const blobCall = calls.find((c) => c.url.endsWith("/git/blobs"));
    const body = JSON.parse(blobCall.options.body);
    expect(body.encoding).toEqual("utf-8");
    expect(body.content).toEqual(JSON.stringify({name: "Firebolt"}, null, 2));
  });

  it("base64-encodes an uploaded File", async () => {
    const {calls} = stubGithubApi();
    const file = new File(["hello"], "x.png", {type: "image/png"});
    await commitFiles({"graphics/x.png": file}, {message: "m"});

    const blobCall = calls.find((c) => c.url.endsWith("/git/blobs"));
    const body = JSON.parse(blobCall.options.body);
    expect(body.encoding).toEqual("base64");
    expect(atob(body.content)).toEqual("hello");
  });

  it("builds the tree from every blob's path and sha, based on the base tree", async () => {
    const {calls} = stubGithubApi();
    await commitFiles({"abilities/a.json": {a: 1}, "abilities/b.json": {b: 2}}, {message: "m"});

    const treeCall = calls.find((c) => c.url.endsWith("/git/trees"));
    const body = JSON.parse(treeCall.options.body);
    expect(body.base_tree).toEqual("base-tree-sha");
    expect(body.tree.map((t) => t.path).sort()).toEqual(["abilities/a.json", "abilities/b.json"]);
    expect(body.tree.every((t) => t.mode === "100644" && t.type === "blob" && t.sha)).toBe(true);
  });

  it("passes the commit message and parents through to the commit call", async () => {
    const {calls} = stubGithubApi();
    await commitFiles({"abilities/a.json": {a: 1}}, {message: "Add fireball"});

    const commitCall = calls.filter((c) => c.url.endsWith("/git/commits") && c.options.method === "POST")[0];
    const body = JSON.parse(commitCall.options.body);
    expect(body.message).toEqual("Add fireball");
    expect(body.parents).toEqual(["base-commit-sha"]);
    expect(body.tree).toEqual("new-tree-sha");
  });

  it("moves the branch ref to the new commit as the final step", async () => {
    const {calls} = stubGithubApi();
    await commitFiles({"abilities/a.json": {a: 1}}, {message: "m"});

    const refCall = calls[calls.length - 1];
    expect(refCall.url).toEqual("https://api.github.com/repos/nevinera/delve-content/git/refs/heads/main");
    expect(refCall.options.method).toEqual("PATCH");
    expect(JSON.parse(refCall.options.body)).toEqual({sha: "new-commit-sha"});
  });

  it("bypasses the browser's HTTP cache on every GitHub API request, so a second save can't read a stale ref", async () => {
    const {calls} = stubGithubApi();
    await commitFiles({"abilities/a.json": {a: 1}}, {message: "m"});

    const githubCalls = calls.filter((c) => c.url.startsWith("https://api.github.com"));
    expect(githubCalls.length).toBeGreaterThan(0);
    expect(githubCalls.every((c) => c.options.cache === "no-store")).toBe(true);
  });

  it("throws a descriptive error when a GitHub API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (url === "/github/token") {
        return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      }
      if (url === "https://api.github.com/repos/nevinera/delve-content") {
        return Promise.resolve(jsonResponse({default_branch: "main"}));
      }
      return Promise.resolve(jsonResponse({message: "Not Found"}, false, 404));
    }));

    await expect(commitFiles({"abilities/a.json": {a: 1}}, {message: "m"})).rejects.toThrow(/GitHub API error 404/);
  });
});
