import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveDraft} from "../saveDraft";
import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft} from "../WorldDraft";
import * as commitModule from "../../../github/commitFiles";

const snapshot = new RepoSnapshot({
  worldKey: "small",
  branch: "world-editor",
  commitSha: "c1",
  files: {"worlds/small/small.json": {sha: "s1", size: 1}},
  json: {"worlds/small/small.json": {name: "Small"}},
});

function fakeClient() {
  return {
    headSha: vi.fn().mockResolvedValue("c2"),
    snapshot: vi.fn().mockResolvedValue({commitSha: "c2", files: {"worlds/small/small.json": {sha: "s2", size: 1}}}),
    readBlobText: vi.fn().mockResolvedValue('{"name": "Smaller"}'),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("saveDraft", () => {
  it("commits only the changes, on the snapshot's branch and commit, then reloads", async () => {
    const commit = vi.spyOn(commitModule, "commitFiles").mockResolvedValue({commitSha: "c2", branch: "world-editor"});
    const draft = WorldDraft.fromSnapshot(snapshot).write("worlds/small/small.json", {name: "Smaller"});

    const result = await saveDraft(fakeClient(), draft, "Rename");

    expect(commit).toHaveBeenCalledWith(
      {"worlds/small/small.json": {name: "Smaller"}},
      expect.objectContaining({message: "Rename", branch: "world-editor", parentSha: "c1"})
    );
    expect(result.snapshot.commitSha).toEqual("c2");
    expect(result.draft.hasChanges).toBe(false);
    expect(result.draft.read("worlds/small/small.json")).toEqual({name: "Smaller"});
  });

  it("refuses an empty save", async () => {
    await expect(saveDraft(fakeClient(), WorldDraft.fromSnapshot(snapshot), "m")).rejects.toThrow(/Nothing to save/);
  });
});
