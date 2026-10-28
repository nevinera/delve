import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExistingBlob, GithubAuthError, GithubClient, blobSha, fromBase64, toBase64 } from "./github.js";

const API = "https://api.github.com/repos/me/world";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const later = () => new Date(Date.now() + 3600_000).toISOString();

// A fake GitHub: `routes` maps "METHOD url" to a body or a function of the request body.
function fakeGithub(routes) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, { method = "GET", body } = {}) => {
    const parsed = body && JSON.parse(body);
    calls.push({ method, url, body: parsed });
    if (url === "/github/token") return json({ token: "t", expires_at: later() });
    const route = routes[`${method} ${url}`];
    if (route === undefined) return json({ message: "Not Found" }, 404);
    return typeof route === "function" ? route(parsed) : json(route);
  });
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("GithubClient", () => {
  it("throws GithubAuthError with where to go when you aren't connected", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "not_connected", connect_url: "/github/connect" }, 401));
    const error = await new GithubClient("me/world").defaultBranch().catch((e) => e);
    expect(error).toBeInstanceOf(GithubAuthError);
    expect(error.redirectUrl).toBe("/github/connect");
  });

  it("fetches the token once while it lasts", async () => {
    const calls = fakeGithub({ [`GET ${API}`]: { default_branch: "main" }, [`GET ${API}/git/ref/heads/main`]: { object: { sha: "c1" } } });
    const client = new GithubClient("me/world");
    expect(await client.defaultBranch()).toBe("main");
    expect(await client.headSha("main")).toBe("c1");
    expect(calls.filter((c) => c.url === "/github/token")).toHaveLength(1);
  });

  it("lists the files under a directory at a commit, and none for a missing one", async () => {
    fakeGithub({
      [`GET ${API}/git/commits/c1`]: { tree: { sha: "root" } },
      [`GET ${API}/git/trees/root`]: { tree: [{ path: "tiles", type: "tree", sha: "tiles" }] },
      [`GET ${API}/git/trees/tiles?recursive=1`]: {
        tree: [
          { path: "main", type: "tree", sha: "m" },
          { path: "main/0,0.bin.gz", type: "blob", sha: "b1", size: 10 },
        ],
      },
    });
    const client = new GithubClient("me/world");
    expect(await client.files("c1", "tiles")).toEqual({ "tiles/main/0,0.bin.gz": { sha: "b1", size: 10 } });
    expect(await client.files("c1", "nope")).toEqual({});
  });

  it("refuses a listing GitHub cut short", async () => {
    fakeGithub({
      [`GET ${API}/git/commits/c1`]: { tree: { sha: "root" } },
      [`GET ${API}/git/trees/root?recursive=1`]: { tree: [], truncated: true },
    });
    await expect(new GithubClient("me/world").files("c1")).rejects.toThrow(/too many files/);
  });

  it("reads a blob as bytes or text", async () => {
    fakeGithub({ [`GET ${API}/git/blobs/b1`]: { content: `${toBase64(new TextEncoder().encode("héllo"))}\n` } });
    const client = new GithubClient("me/world");
    expect(await client.readText("b1")).toBe("héllo");
    expect([...(await client.readBytes("b1"))]).toEqual([...new TextEncoder().encode("héllo")]);
  });

  it("commits text, bytes, kept blobs and deletions as one commit on the parent", async () => {
    const calls = fakeGithub({
      [`GET ${API}/git/commits/c1`]: { tree: { sha: "root" } },
      [`POST ${API}/git/blobs`]: { sha: "new-blob" },
      [`POST ${API}/git/trees`]: { sha: "tree2" },
      [`POST ${API}/git/commits`]: { sha: "c2" },
      [`PATCH ${API}/git/refs/heads/main`]: { object: { sha: "c2" } },
    });
    const progress = [];
    const sha = await new GithubClient("me/world").commit(
      { "world.json": "{}", "tiles/0,0.bin.gz": new Uint8Array([1, 2, 255]), "moved.png": new ExistingBlob("old"), "gone.json": null },
      { message: "Save", branch: "main", parentSha: "c1", onProgress: (p) => progress.push(p) },
    );
    expect(sha).toBe("c2");
    expect([...fromBase64(calls.find((c) => c.url.endsWith("/git/blobs")).body.content)]).toEqual([1, 2, 255]);
    expect(calls.find((c) => c.url.endsWith("/git/trees")).body).toEqual({
      base_tree: "root",
      tree: [
        { path: "world.json", mode: "100644", type: "blob", content: "{}" },
        { path: "tiles/0,0.bin.gz", mode: "100644", type: "blob", sha: "new-blob" },
        { path: "moved.png", mode: "100644", type: "blob", sha: "old" },
        { path: "gone.json", mode: "100644", type: "blob", sha: null },
      ],
    });
    expect(calls.find((c) => c.url.endsWith("/git/commits")).body).toEqual({ message: "Save", tree: "tree2", parents: ["c1"] });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { sha: "c2" } });
    expect(progress.at(-1)).toEqual({ done: 4, total: 4 });
  });

  it("fails when the branch has moved past the parent", async () => {
    fakeGithub({
      [`GET ${API}/git/commits/c1`]: { tree: { sha: "root" } },
      [`POST ${API}/git/trees`]: { sha: "tree2" },
      [`POST ${API}/git/commits`]: { sha: "c2" },
      [`PATCH ${API}/git/refs/heads/main`]: () => json({ message: "Update is not a fast forward" }, 422),
    });
    const client = new GithubClient("me/world");
    await expect(client.commit({ "a.json": "{}" }, { message: "m", branch: "main", parentSha: "c1" })).rejects.toThrow(/not a fast forward/);
  });

  it("sends a big tree in parts, each building on the last", async () => {
    let n = 0;
    const calls = fakeGithub({
      [`GET ${API}/git/commits/c1`]: { tree: { sha: "root" } },
      [`POST ${API}/git/trees`]: () => json({ sha: `tree${++n}` }),
      [`POST ${API}/git/commits`]: { sha: "c2" },
      [`PATCH ${API}/git/refs/heads/main`]: { object: { sha: "c2" } },
    });
    const files = Object.fromEntries(Array.from({ length: 1200 }, (_, k) => [`f${k}.txt`, "x"]));
    files["big.plate"] = "y".repeat(10_000_000);
    await new GithubClient("me/world").commit(files, { message: "m", branch: "main", parentSha: "c1" });
    const trees = calls.filter((c) => c.url.endsWith("/git/trees")).map((c) => c.body);
    expect(trees.map((t) => [t.base_tree, t.tree.length])).toEqual([["root", 500], ["tree1", 500], ["tree2", 200], ["tree3", 1]]);
    expect(calls.find((c) => c.url.endsWith("/git/commits")).body.tree).toBe("tree4");
  });
});

describe("tags", () => {
  it("lists tags with the commit each points at, through annotated tags", async () => {
    fakeGithub({
      [`GET ${API}/git/matching-refs/tags/`]: [
        { ref: "refs/tags/v1", object: { sha: "c1", type: "commit" } },
        { ref: "refs/tags/v2", object: { sha: "t2", type: "tag" } },
      ],
      [`GET ${API}/git/tags/t2`]: { object: { sha: "c2", type: "commit" } },
    });
    expect(await new GithubClient("me/world").tags()).toEqual([
      { name: "v1", sha: "c1" },
      { name: "v2", sha: "c2" },
    ]);
  });

  it("tags a commit", async () => {
    const calls = fakeGithub({ [`POST ${API}/git/refs`]: { ref: "refs/tags/v3" } });
    await new GithubClient("me/world").createTag("v3", "c3");
    expect(calls.find((c) => c.method === "POST").body).toEqual({ ref: "refs/tags/v3", sha: "c3" });
  });
});

describe("blobSha", () => {
  it("is git's sha for the bytes", async () => {
    expect(await blobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
