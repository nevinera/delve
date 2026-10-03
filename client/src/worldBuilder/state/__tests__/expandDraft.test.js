import {describe, it, expect, vi, beforeEach} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {expandDraft, isExpanded, staleExpansions} from "../expandDraft";
import {resolveZone} from "../zoneOps";
import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft} from "../WorldDraft";
import * as commitModule from "../../../github/commitFiles";

beforeEach(() => {
  vi.restoreAllMocks();
});

// The fixture with forest's .full.json committed and current.
function expandedFixture() {
  const base = fixtureDraft();
  const json = {...base.snapshot.json, "worlds/w/zones/forest/forest.full.json": resolveZone(base, "forest"), "worlds/w/zones/cave/cave.full.json": resolveZone(base, "cave")};
  const files = {...base.snapshot.files};
  for (const path of Object.keys(json)) files[path] ??= {sha: `sha:${path}`, size: 1};
  return WorldDraft.fromSnapshot(new RepoSnapshot({...base.snapshot, files, json}));
}

describe("expandDraft", () => {
  it("finds every zone whose .full.json is missing or stale", () => {
    expect(Object.keys(staleExpansions(fixtureDraft())).sort()).toEqual(["worlds/w/zones/cave/cave.full.json", "worlds/w/zones/forest/forest.full.json"]);
    expect(isExpanded(fixtureDraft())).toBe(false);
    expect(isExpanded(expandedFixture())).toBe(true);
  });

  it("sees an expansion go stale when the content it was built from changes", () => {
    const edited = expandedFixture().write("worlds/w/unit_types/goblin.json", {name: "Hobgoblin"});

    expect(Object.keys(staleExpansions(edited))).toEqual(["worlds/w/zones/forest/forest.full.json"]);
  });

  it("commits the stale expansions in one commit on the branch, then reloads", async () => {
    const commit = vi.spyOn(commitModule, "commitFiles").mockResolvedValue({commitSha: "c2"});
    const client = {
      headSha: vi.fn().mockResolvedValue("c2"),
      snapshot: vi.fn().mockResolvedValue({commitSha: "c2", files: {}}),
      readBlobText: vi.fn(),
    };

    const result = await expandDraft(client, fixtureDraft(), "Expand W");

    const [files, options] = commit.mock.calls[0];
    expect(Object.keys(files).sort()).toEqual(["worlds/w/zones/cave/cave.full.json", "worlds/w/zones/forest/forest.full.json"]);
    expect(files["worlds/w/zones/forest/forest.full.json"].maps[0].identifier).toEqual("hub");
    expect(options).toEqual(expect.objectContaining({message: "Expand W", branch: "b", parentSha: "c1"}));
    expect(result.snapshot.commitSha).toEqual("c2");
  });

  it("refuses to expand unsaved changes", async () => {
    await expect(expandDraft({}, fixtureDraft().write("worlds/w/x.json", {}), "m")).rejects.toThrow(/Save before expanding/);
  });
});
