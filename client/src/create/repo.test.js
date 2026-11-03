import { describe, expect, it } from "vitest";
import { strFromU8, strToU8 } from "fflate";
import { blobSha } from "../github/github.js";
import { BranchMoved, fromRepo, latestVersion, loadRepo, nextVersion, repoChanges, saveRepo } from "./repo.js";

// A fake GithubClient holding one branch: `files` path -> text at commit `head`.
function fakeClient(files = {}, head = "c1") {
  const blobs = new Map();
  const client = {
    repo: "me/thorn",
    head,
    reads: [],
    commits: [],
    listed: {},
    defaultBranch: async () => "main",
    headSha: async () => client.head,
    files: async () => client.listed,
    readAll: async (list) => list.map((sha) => (client.reads.push(sha), blobs.get(sha))),
    commit: async (changes, opts) => (client.commits.push({ changes, ...opts }), (client.head = `c${client.commits.length + 1}`)),
    firstCommit: async (path, content) => (client.commits.push({ first: { [path]: content } }), (client.head = "c0")),
  };
  client.ready = (async () => {
    for (const [path, text] of Object.entries(files)) {
      const bytes = strToU8(text);
      const sha = await blobSha(bytes);
      blobs.set(sha, bytes);
      client.listed[path] = { sha, size: bytes.length };
    }
  })();
  return client;
}

describe("repo worlds", () => {
  it("reads the repo a from parameter names", () => {
    expect(fromRepo("github/me/thorn")).toBe("me/thorn");
    expect(fromRepo("zip")).toBe(null);
  });

  it("opens the head of the default branch, downloading only files the kept world lacks at that sha", async () => {
    const client = fakeClient({ "world.json": '{"version":2,"name":"Thorn"}', "a.json": "1", "b.json": "2" });
    await client.ready;
    const first = await loadRepo(client);
    expect(first.source).toMatchObject({ repo: "me/thorn", branch: "main", commitSha: "c1" });
    expect(strFromU8(first.files.get("a.json"))).toBe("1");
    expect(client.reads).toHaveLength(3);
    client.reads = [];
    const again = await loadRepo(client, { kept: first });
    expect(client.reads).toHaveLength(0);
    expect(again.files.get("b.json")).toBe(first.files.get("b.json"));
  });

  it("gives a repo with no world a new one, named after the repo", async () => {
    const client = fakeClient({ "README.md": "hi" }, null);
    await client.ready;
    const { files, source } = await loadRepo(client);
    expect(source.commitSha).toBe(null);
    expect(JSON.parse(strFromU8(files.get("world.json")))).toMatchObject({ version: 2, name: "thorn" });
  });

  it("saves what changed and what's gone as one commit, and refuses once the branch has moved", async () => {
    const client = fakeClient({ "world.json": "{}", "a.json": "1", "x.bin": "x" });
    await client.ready;
    const { files, source } = await loadRepo(client);
    files.set("a.json", strToU8("2"));
    files.set("p.bin", new Uint8Array([1, 2]));
    files.delete("x.bin");
    expect(Object.keys((await repoChanges(files, source)).changes).sort()).toEqual(["a.json", "p.bin", "x.bin"]);
    const next = await saveRepo(client, files, source, { message: "m" });
    expect(client.commits[0]).toMatchObject({ changes: { "a.json": "2", "x.bin": null }, branch: "main", parentSha: "c1", message: "m" });
    expect(client.commits[0].changes["p.bin"]).toEqual(new Uint8Array([1, 2]));
    expect(next.commitSha).toBe("c2");
    expect(await saveRepo(client, files, next, { message: "m" })).toBe(null);
    client.head = "elsewhere";
    await expect(saveRepo(client, files, next, { message: "m" })).rejects.toBeInstanceOf(BranchMoved);
  });

  it("saves only the paths asked for, leaving what else differs as it was", async () => {
    const [kept, ground] = [strToU8("1"), strToU8("old")];
    const source = {
      repo: "me/thorn",
      branch: "main",
      commitSha: "c1",
      shas: { "objects/a.json": await blobSha(kept), "objects/gone.json": "x", "ground.plate": await blobSha(ground) },
    };
    const client = fakeClient();
    const files = new Map([
      ["objects/a.json", strToU8("2")],
      ["ground.plate", strToU8("new")],
      ["notes.json", strToU8("{}")],
    ]);
    const only = (path) => path.startsWith("objects/");
    const next = await saveRepo(client, files, source, { only, message: "objects" });
    expect(client.commits[0].changes).toEqual({ "objects/a.json": "2", "objects/gone.json": null });
    expect(next.shas["ground.plate"]).toBe(source.shas["ground.plate"]);
    expect(next.shas["objects/a.json"]).toBe(await blobSha(strToU8("2")));
    expect(next.shas).not.toHaveProperty("objects/gone.json");
    expect(next.shas).not.toHaveProperty("notes.json");
  });

  it("won't save only some paths to a repo with no commits", async () => {
    const source = { repo: "me/thorn", branch: "main", commitSha: null, shas: {} };
    await expect(saveRepo(fakeClient({}, null), new Map(), source, { only: () => true })).rejects.toThrow("no commits");
  });

  it("starts a repo with no commits with its world.json, then commits the rest on it", async () => {
    const client = fakeClient({}, null);
    const { files, source } = await loadRepo(client);
    files.set("a.json", strToU8("1"));
    const next = await saveRepo(client, files, source, { message: "m" });
    expect(Object.keys(client.commits[0].first)).toEqual(["world.json"]);
    expect(client.commits[1]).toMatchObject({ changes: { "a.json": "1" }, parentSha: "c0" });
    expect(next.commitSha).toBe("c3");
  });

  it("numbers versions after the highest v tag", () => {
    const tags = [{ name: "v2", sha: "b" }, { name: "v10", sha: "c" }, { name: "beta", sha: "d" }];
    expect(latestVersion(tags)).toMatchObject({ name: "v10", sha: "c" });
    expect(nextVersion(tags)).toBe("v11");
    expect(nextVersion([])).toBe("v1");
  });
});
