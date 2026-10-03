import {describe, it, expect} from "vitest";
import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft, stableStringify} from "../WorldDraft";
import {ExistingBlob} from "../../../github/commitFiles";

function snapshot(json = {}, assets = {}) {
  const files = {};
  for (const path of Object.keys(json)) files[path] = {sha: `sha-${path}`, size: 1};
  for (const [path, sha] of Object.entries(assets)) files[path] = {sha, size: 100};
  return new RepoSnapshot({worldKey: "w", branch: "b", commitSha: "c1", files, json});
}

const ZONE = "worlds/w/zones/a/a.json";
const MAP_PNG = "worlds/w/zones/a/m/m.png";

describe("WorldDraft", () => {
  it("reads through to git until a path is edited", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A"}}));

    expect(draft.read(ZONE)).toEqual({name: "A"});
    expect(draft.hasChanges).toBe(false);

    const edited = draft.write(ZONE, {name: "B"});
    expect(edited.read(ZONE)).toEqual({name: "B"});
    expect(edited.changes()).toEqual({[ZONE]: {name: "B"}});
    expect(draft.read(ZONE)).toEqual({name: "A"});
  });

  it("goes clean again when a file is edited back to what git has, whatever the key order", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A", elvl: 1}}));

    const back = draft.write(ZONE, {name: "B", elvl: 1}).write(ZONE, {elvl: 1, name: "A"});

    expect(back.hasChanges).toBe(false);
  });

  it("deletes files git has, and simply forgets new ones", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {}}));

    expect(draft.remove(ZONE).changes()).toEqual({[ZONE]: null});
    expect(draft.remove(ZONE).exists(ZONE)).toBe(false);
    expect(draft.write("worlds/w/new.json", {}).remove("worlds/w/new.json").hasChanges).toBe(false);
  });

  it("lists paths under a directory, including new ones and excluding deleted ones", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {}, "worlds/w/zones/b/b.json": {}, "worlds/w/zones/ab/ab.json": {}}))
      .write("worlds/w/zones/a/a.layout.json", {})
      .remove("worlds/w/zones/b/b.json");

    expect(draft.paths("worlds/w/zones/a")).toEqual([ZONE, "worlds/w/zones/a/a.layout.json"].sort());
    expect(draft.paths("worlds/w/zones")).not.toContain("worlds/w/zones/b/b.json");
  });

  it("moves a directory, carrying git's assets as existing blobs", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A"}}, {[MAP_PNG]: "png-sha"}));

    const moved = draft.moveDir("worlds/w/zones/a", "worlds/w/zones/z");

    expect(moved.changes()).toEqual({
      [ZONE]: null,
      [MAP_PNG]: null,
      "worlds/w/zones/z/a.json": {name: "A"},
      "worlds/w/zones/z/m/m.png": new ExistingBlob("png-sha"),
    });
    expect(moved.assetSource("worlds/w/zones/z/m/m.png")).toEqual({sha: "png-sha"});
  });

  it("moving a directory back undoes the move entirely", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A"}}, {[MAP_PNG]: "png-sha"}));

    const back = draft.moveDir("worlds/w/zones/a", "worlds/w/zones/z").moveDir("worlds/w/zones/z", "worlds/w/zones/a");

    expect(back.hasChanges).toBe(false);
  });

  it("refuses to move onto an existing directory", () => {
    const draft = WorldDraft.fromSnapshot(snapshot({[ZONE]: {}, "worlds/w/zones/b/b.json": {}}));

    expect(() => draft.moveDir("worlds/w/zones/a", "worlds/w/zones/b")).toThrow(/already exists/);
  });

  it("describes asset sources: pending upload, git, or nothing", () => {
    const upload = new Blob(["png"]);
    const draft = WorldDraft.fromSnapshot(snapshot({}, {[MAP_PNG]: "png-sha"}));

    expect(draft.assetSource(MAP_PNG)).toEqual({sha: "png-sha"});
    expect(draft.write(MAP_PNG, upload).assetSource(MAP_PNG)).toEqual({blob: upload});
    expect(draft.assetSource("worlds/w/missing.png")).toBeNull();
    expect(draft.write(MAP_PNG, upload).pendingUploadBytes()).toEqual(3);
  });

  it("hashes identical content identically, and any change differently", () => {
    const base = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A"}}));
    const a = base.write(ZONE, {name: "B", elvl: 1});
    const b = base.write(ZONE, {elvl: 1, name: "B"});

    expect(a.hash()).toEqual(b.hash());
    expect(a.hash()).not.toEqual(base.hash());
    expect(base.write(MAP_PNG, new Blob(["x"])).hash()).not.toEqual(base.write(MAP_PNG, new Blob(["x"])).hash());
  });

  it("replays saved changes onto a fresh draft", () => {
    const base = WorldDraft.fromSnapshot(snapshot({[ZONE]: {name: "A"}, "worlds/w/old.json": {}}));
    const edited = base.write(ZONE, {name: "B"}).remove("worlds/w/old.json");

    expect(base.applyChanges(edited.changes()).changes()).toEqual(edited.changes());
  });
});

describe("stableStringify", () => {
  it("ignores key order at every depth", () => {
    expect(stableStringify({b: [{y: 1, x: 2}], a: null})).toEqual(stableStringify({a: null, b: [{x: 2, y: 1}]}));
  });
});
