import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { fromRepo, loadFromGithub } from "./githubWorld.js";
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
});
