import {describe, it, expect} from "vitest";
import {createDraftStore, memoryBackend, draftKey} from "../draftStore";
import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft} from "../WorldDraft";
import {ExistingBlob} from "../../../github/commitFiles";

const snapshot = new RepoSnapshot({
  worldKey: "w",
  branch: "b",
  commitSha: "c1",
  files: {"worlds/w/w.json": {sha: "s", size: 1}, "worlds/w/old.png": {sha: "png", size: 1}},
  json: {"worlds/w/w.json": {name: "W"}},
});

describe("draftStore", () => {
  it("keys records by repo, branch and world", () => {
    expect(draftKey("o/r", "main", "small")).toEqual("o/r|main|small");
  });

  it("round-trips a draft's changes, including uploads, moved files and deletions", async () => {
    const store = createDraftStore(memoryBackend());
    const upload = new Blob(["png"]);
    const draft = WorldDraft.fromSnapshot(snapshot)
      .write("worlds/w/w.json", {name: "Renamed"})
      .write("worlds/w/new.png", upload)
      .moveDir("worlds/w/old.png", "worlds/w/moved.png");

    await store.save("k", draft);
    const record = await store.load("k");

    expect(record.baseCommitSha).toEqual("c1");
    expect(record.changes).toEqual({
      "worlds/w/w.json": {name: "Renamed"},
      "worlds/w/new.png": upload,
      "worlds/w/old.png": null,
      "worlds/w/moved.png": new ExistingBlob("png"),
    });
    expect(WorldDraft.fromSnapshot(snapshot).applyChanges(record.changes).hash()).toEqual(draft.hash());
  });

  it("clears the record when the draft has no changes", async () => {
    const store = createDraftStore(memoryBackend());
    await store.save("k", WorldDraft.fromSnapshot(snapshot).write("worlds/w/w.json", {name: "X"}));

    await store.save("k", WorldDraft.fromSnapshot(snapshot));

    expect(await store.load("k")).toBeNull();
  });
});
