import { strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { blobSha } from "../github/github.js";
import { BranchMoved, delta, fromRepo, latestVersion, loadFromGithub, nextVersion, saveToGithub } from "./githubWorld.js";
import { World } from "./world.js";

// A fake GithubClient over { path: [sha, text] }, counting the blobs it reads.
function fakeClient(files, { head = "c1" } = {}) {
  const bySha = Object.fromEntries(Object.values(files).map(([sha, text]) => [sha, strToU8(text)]));
  return {
    repo: "me/thorn",
    read: [],
    defaultBranch: async () => "main",
    headSha: async () => head,
    files: async () => Object.fromEntries(Object.entries(files).map(([path, [sha]]) => [path, { sha, size: 1 }])),
    async readAll(shas) {
      this.read.push(...shas);
      return shas.map((sha) => bySha[sha]);
    },
  };
}

describe("worlds from GitHub", () => {
  it("reads the repo a from parameter names", () => {
    expect(fromRepo("github/me/thorn-wood.v2")).toBe("me/thorn-wood.v2");
    expect(fromRepo("me/thorn")).toBeNull();
    expect(fromRepo("github/me/../x/y")).toBeNull();
    expect(fromRepo(null)).toBeNull();
  });

  it("loads every file at the head of the default branch", async () => {
    const client = fakeClient({ "world.json": ["w1", '{"name":"Thornwood","continents":[]}'], "places/a.json": ["a1", "{}"] });
    const { world, source } = await loadFromGithub(client);
    expect(world.info.name).toBe("Thornwood");
    expect(world.readJson("places/a.json")).toEqual({});
    expect(source).toEqual({ repo: "me/thorn", branch: "main", commitSha: "c1", shas: { "world.json": "w1", "places/a.json": "a1" } });
  });

  it("starts an empty world from a repo with no commits", async () => {
    const { world, source } = await loadFromGithub(fakeClient({}, { head: null }));
    expect(world.info.name).toBe("New world");
    expect(source).toMatchObject({ commitSha: null, shas: {} });
  });

  it("downloads only the files that changed since the kept copy", async () => {
    const kept = World.empty();
    kept.writeJson("places/a.json", { old: true });
    const client = fakeClient({ "world.json": ["w2", '{"name":"New name","continents":[]}'], "places/a.json": ["a1", '{"old":false}'] });
    const { world } = await loadFromGithub(client, { kept: { world: kept, source: { repo: "Me/Thorn", shas: { "world.json": "w1", "places/a.json": "a1" } } } });
    expect(client.read).toEqual(["w2"]);
    expect(world.info.name).toBe("New name");
    expect(world.readJson("places/a.json")).toEqual({ old: true });
  });

  it("names a world without world.json after its repo", async () => {
    const { world } = await loadFromGithub(fakeClient({ "places/continents/main/sketch.json": ["s1", "{}"] }));
    expect(world.info).toMatchObject({ name: "thorn", continents: [{ key: "main" }] });
  });

  it("opens a repo with files but no world as a new world, keeping its files", async () => {
    const { world, source } = await loadFromGithub(fakeClient({ "README.md": ["r1", "# Vale"], LICENSE: ["l1", "MIT"] }));
    expect(world.info).toMatchObject({ name: "thorn", continents: [{ key: "main", name: "Main" }] });
    expect(strFromU8(world.files.get("README.md"))).toBe("# Vale");
    expect(world.files.has("LICENSE")).toBe(true);
    expect(source.shas).toEqual({ "README.md": "r1", LICENSE: "l1" });
  });

  it("keeps the kept world's tiles for a plate that hasn't changed", async () => {
    const kept = World.empty();
    const tile = "places/continents/main/tiles/surface/3/4.dlt.gz";
    kept.files.set(tile, new Uint8Array([1, 2, 3]));
    const client = fakeClient({ "world.json": ["w1", '{"name":"Thornwood","continents":[]}'], "places/continents/main/plates/surface/0_0.plate": ["p1", "unread"] });
    const { world } = await loadFromGithub(client, { kept: { world: kept, source: { repo: "me/thorn", shas: { "places/continents/main/plates/surface/0_0.plate": "p1" } } } });
    expect(client.read).toEqual(["w1"]);
    expect(world.files.get(tile)).toEqual(new Uint8Array([1, 2, 3]));
  });

  describe("saving", () => {
    // A world of two files, opened at c1 with "same.json" as it is now, and "gone.json" since removed.
    async function opened() {
      const world = new World(new Map([["same.json", strToU8("{}")], ["changed.json", strToU8('{"a":2}')], ["land.f32", new Uint8Array([1, 2])]]));
      const source = { repo: "me/thorn", branch: "main", commitSha: "c1", shas: { "same.json": await blobSha(strToU8("{}")), "changed.json": "old", "gone.json": "x" } };
      const client = { repo: "me/thorn", head: "c1", headSha: async () => client.head, commit: async (files, options) => ((client.committed = { files, options }), (client.head = "c2")) };
      return { world, source, client };
    }

    it("commits what changed, as text or bytes, and deletes what's gone", async () => {
      const { world, source, client } = await opened();
      const saved = await saveToGithub(client, world, source, { message: "Save" });
      expect(client.committed.files).toEqual({ "changed.json": '{"a":2}', "land.f32": new Uint8Array([1, 2]), "gone.json": null });
      expect(client.committed.options).toMatchObject({ message: "Save", branch: "main", parentSha: "c1" });
      expect(saved.commitSha).toBe("c2");
      expect(Object.keys(saved.shas).sort()).toEqual(["changed.json", "land.f32", "same.json"]);
      expect(await saveToGithub(client, world, saved, { message: "Again" })).toBeNull();
    });

    it("refuses when the branch has moved on", async () => {
      const { world, source, client } = await opened();
      client.head = "c9";
      await expect(saveToGithub(client, world, source)).rejects.toBeInstanceOf(BranchMoved);
    });
  });

  describe("versions", () => {
    const tags = [{ name: "v2", sha: "b" }, { name: "v10", sha: "c" }, { name: "beta", sha: "d" }, { name: "v9x", sha: "e" }];

    it("finds the newest version tag, and names the next", () => {
      expect(latestVersion(tags)).toEqual({ name: "v10", sha: "c", number: 10 });
      expect(nextVersion(tags)).toBe("v11");
      expect(latestVersion([{ name: "beta", sha: "d" }])).toBeNull();
      expect(nextVersion([])).toBe("v1");
    });

    it("measures what changed between two sets of files", () => {
      const before = { "a.json": { sha: "1", size: 5 }, "b.json": { sha: "2", size: 5 }, "gone.json": { sha: "3", size: 5 } };
      expect(delta(before, { "a.json": "1", "b.json": "9", "new.json": "8" }, { "b.json": 40, "new.json": 60 })).toEqual({ files: 3, bytes: 100 });
      expect(delta(before, { "a.json": "1", "b.json": "2", "gone.json": "3" })).toEqual({ files: 0, bytes: 0 });
    });
  });
});
