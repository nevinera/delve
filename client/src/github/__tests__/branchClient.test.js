import {describe, it, expect, vi, afterEach, beforeEach} from "vitest";
import {BranchClient} from "../branchClient";
import * as tokenModule from "../token";

const API = "https://api.github.com/repos/nevinera/delve-content";

function respond(body, status = 200) {
  return Promise.resolve({ok: status < 300, status, statusText: "", json: () => Promise.resolve(body)});
}

function stubApi(routes) {
  const calls = [];
  const fetchMock = vi.fn((url, options = {}) => {
    calls.push({url, options});
    const key = `${options.method ?? "GET"} ${url.replace(API, "")}`;
    if (!(key in routes)) throw new Error(`unstubbed ${key}`);
    const route = routes[key];
    return typeof route === "function" ? route(options) : respond(route);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BranchClient", () => {
  it("lists branches across pages", async () => {
    const first = Array.from({length: 100}, (_, i) => ({name: `b${i}`}));
    stubApi({
      "GET /branches?per_page=100&page=1": first,
      "GET /branches?per_page=100&page=2": [{name: "main"}],
    });

    const names = await new BranchClient().listBranches();

    expect(names).toHaveLength(101);
    expect(names.at(-1)).toEqual("main");
  });

  it("creates a branch at the default branch's head", async () => {
    const calls = stubApi({
      "GET ": {default_branch: "main"},
      "GET /git/ref/heads/main": {object: {sha: "main-sha"}},
      "POST /git/refs": {},
    });

    await new BranchClient().createBranch("world-editor");

    expect(JSON.parse(calls.at(-1).options.body)).toEqual({ref: "refs/heads/world-editor", sha: "main-sha"});
  });

  it("explains a branch that can't be created", async () => {
    stubApi({
      "GET ": {default_branch: "main"},
      "GET /git/ref/heads/main": {object: {sha: "main-sha"}},
      "POST /git/refs": () => respond({message: "Reference already exists"}, 422),
    });

    await expect(new BranchClient().createBranch("main")).rejects.toThrow(/Reference already exists/);
  });

  it("reads a branch's head sha, and says so when the branch is missing", async () => {
    stubApi({"GET /git/ref/heads/a": {object: {sha: "a-sha"}}, "GET /git/ref/heads/nope": () => respond({}, 404)});
    const client = new BranchClient();

    expect(await client.headSha("a")).toEqual("a-sha");
    await expect(client.headSha("nope")).rejects.toThrow(/doesn't exist/);
  });

  it("snapshots every file under a directory at a commit", async () => {
    stubApi({
      "GET /git/commits/c1": {tree: {sha: "root"}},
      "GET /git/trees/root": {tree: [{path: "worlds", type: "tree", sha: "worlds-tree"}]},
      "GET /git/trees/worlds-tree": {tree: [{path: "small", type: "tree", sha: "small-tree"}]},
      "GET /git/trees/small-tree?recursive=1": {
        truncated: false,
        tree: [
          {path: "small.json", type: "blob", sha: "s1", size: 10},
          {path: "zones", type: "tree", sha: "z"},
          {path: "zones/forest/forest.json", type: "blob", sha: "f1", size: 20},
        ],
      },
    });

    const snapshot = await new BranchClient().snapshot("c1", "worlds/small");

    expect(snapshot).toEqual({
      commitSha: "c1",
      files: {
        "worlds/small/small.json": {sha: "s1", size: 10},
        "worlds/small/zones/forest/forest.json": {sha: "f1", size: 20},
      },
    });
  });

  it("snapshots a missing directory as empty", async () => {
    stubApi({
      "GET /git/commits/c1": {tree: {sha: "root"}},
      "GET /git/trees/root": {tree: []},
    });

    expect(await new BranchClient().snapshot("c1", "worlds/new")).toEqual({commitSha: "c1", files: {}});
  });

  it("decodes a blob's text", async () => {
    stubApi({"GET /git/blobs/b1": {content: btoa('{"name":"Small"}\n')}});

    expect(await new BranchClient().readBlobText("b1")).toEqual('{"name":"Small"}\n');
  });

  it("builds asset URLs pinned to a commit", async () => {
    expect(await new BranchClient().rawUrl("c1", "worlds/small/a.png")).toEqual("https://raw.githubusercontent.com/nevinera/delve-content/c1/worlds/small/a.png");
  });
});
