import {describe, it, expect, vi, afterEach} from "vitest";
import {GithubClient, GithubAuthError} from "../delve-github";
import * as tokenModule from "../token";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GithubClient#fetchFile", () => {
  it("decodes the base64 content GitHub returns", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({content: btoa('{"name":"Sword"}')}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GithubClient().fetchFile("items/sword.json");

    expect(result).toBe('{"name":"Sword"}');
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/nevinera/delve-content/contents/items/sword.json",
      expect.objectContaining({headers: expect.objectContaining({Authorization: "Bearer tok"})})
    );
  });

  it("returns null for a 404 (file doesn't exist yet), not an error", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 404}));

    const result = await new GithubClient().fetchFile("items/missing.json");

    expect(result).toBeNull();
  });

  it("throws on a non-404 error response", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 500, statusText: "Server Error", json: async () => ({message: "boom"})}));

    await expect(new GithubClient().fetchFile("items/sword.json")).rejects.toThrow(/boom/);
  });

  it("caches the token across multiple calls on the same instance", async () => {
    const fetchTokenSpy = vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, status: 200, json: async () => ({content: btoa("{}")})}));

    const client = new GithubClient();
    await client.fetchFile("items/a.json");
    await client.fetchFile("items/b.json");

    expect(fetchTokenSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates GithubAuthError from an expired/missing connection", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));

    await expect(new GithubClient().fetchFile("items/a.json")).rejects.toBeInstanceOf(GithubAuthError);
  });
});

describe("GithubClient#assetUrl", () => {
  it("builds a raw.githubusercontent.com URL using the repo's default branch", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({default_branch: "main"})});
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GithubClient().assetUrl("abilities/graphics/icons/punch.svg");

    expect(result).toBe("https://raw.githubusercontent.com/nevinera/delve-content/main/abilities/graphics/icons/punch.svg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/nevinera/delve-content",
      expect.objectContaining({headers: expect.objectContaining({Authorization: "Bearer tok"})})
    );
  });

  it("caches the default branch across multiple calls on the same instance", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({default_branch: "main"})});
    vi.stubGlobal("fetch", fetchMock);

    const client = new GithubClient();
    await client.assetUrl("a.svg");
    await client.assetUrl("b.svg");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GithubClient#listDirectory", () => {
  function stubTrees({branch = "main", root, nested = {}, recursive}) {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn(async (url) => {
      if (url === "https://api.github.com/repos/nevinera/delve-content") return {ok: true, json: async () => ({default_branch: branch})};
      if (url === `https://api.github.com/repos/nevinera/delve-content/git/trees/${branch}`) return {ok: true, json: async () => ({tree: root})};
      const nestedMatch = Object.entries(nested).find(([sha]) => url === `https://api.github.com/repos/nevinera/delve-content/git/trees/${sha}`);
      if (nestedMatch) return {ok: true, json: async () => ({tree: nestedMatch[1]})};
      if (url === `https://api.github.com/repos/nevinera/delve-content/git/trees/${recursive.sha}?recursive=1`) return {ok: true, json: async () => ({tree: recursive.entries})};
      throw new Error(`unstubbed request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("resolves a single-segment path, then lists it recursively", async () => {
    stubTrees({
      root: [{path: "abilities", type: "tree", sha: "abilities-sha"}],
      recursive: {sha: "abilities-sha", entries: [
        {path: "punch.json", type: "blob"},
        {path: "classes/druid/wildshape.json", type: "blob"},
      ]},
    });

    const result = await new GithubClient().listDirectory("abilities");

    expect(result).toEqual(["abilities/punch.json", "abilities/classes/druid/wildshape.json"]);
  });

  it("resolves a multi-segment path by walking one non-recursive lookup per segment", async () => {
    stubTrees({
      root: [{path: "abilities", type: "tree", sha: "abilities-sha"}],
      nested: {"abilities-sha": [{path: "units", type: "tree", sha: "units-sha"}]},
      recursive: {sha: "units-sha", entries: [{path: "goblin.json", type: "blob"}]},
    });

    const result = await new GithubClient().listDirectory("abilities/units");

    expect(result).toEqual(["abilities/units/goblin.json"]);
  });

  it("returns an empty array when the path doesn't exist", async () => {
    stubTrees({root: [], recursive: {sha: "unused", entries: []}});

    const result = await new GithubClient().listDirectory("items");

    expect(result).toEqual([]);
  });

  it("excludes tree entries, keeping only blobs", async () => {
    stubTrees({
      root: [{path: "items", type: "tree", sha: "items-sha"}],
      recursive: {sha: "items-sha", entries: [
        {path: "dagger.json", type: "blob"},
        {path: "zone1", type: "tree"},
        {path: "zone1/sword.json", type: "blob"},
      ]},
    });

    const result = await new GithubClient().listDirectory("items");

    expect(result).toEqual(["items/dagger.json", "items/zone1/sword.json"]);
  });

  it("caches a non-recursive tree fetch by sha, reused across multiple listDirectory calls that share a prefix", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const responses = {
      "https://api.github.com/repos/nevinera/delve-content": {default_branch: "main"},
      "https://api.github.com/repos/nevinera/delve-content/git/trees/main": {
        tree: [{path: "abilities", type: "tree", sha: "abilities-sha"}],
      },
      "https://api.github.com/repos/nevinera/delve-content/git/trees/abilities-sha": {
        tree: [{path: "units", type: "tree", sha: "units-sha"}, {path: "classes", type: "tree", sha: "classes-sha"}],
      },
      "https://api.github.com/repos/nevinera/delve-content/git/trees/units-sha?recursive=1": {tree: []},
      "https://api.github.com/repos/nevinera/delve-content/git/trees/classes-sha?recursive=1": {tree: []},
    };
    const fetchMock = vi.fn(async (url) => ({ok: true, json: async () => responses[url]}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GithubClient();
    await client.listDirectory("abilities/units");
    await client.listDirectory("abilities/classes");

    const rootTreeFetches = fetchMock.mock.calls.filter(([url]) => url === "https://api.github.com/repos/nevinera/delve-content/git/trees/main").length;
    const abilitiesTreeFetches = fetchMock.mock.calls.filter(([url]) => url === "https://api.github.com/repos/nevinera/delve-content/git/trees/abilities-sha").length;
    expect(rootTreeFetches).toBe(1);
    expect(abilitiesTreeFetches).toBe(1);
  });
});
