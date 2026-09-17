import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveZone} from "../saveZone";
import {commitFiles} from "../../github/commitFiles";
import {resolveZoneRefs} from "../resolveZoneRefs";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));
vi.mock("../resolveZoneRefs", () => ({
  resolveZoneRefs: vi.fn(),
}));

describe("saveZone", () => {
  beforeEach(() => {
    commitFiles.mockReset();
    resolveZoneRefs.mockReset();
  });

  it("commits zone.json (abstract), its resolved .full.json companion, and the layout metadata together", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const zoneData = {name: "Goblin Cave", maps: [{$ref: "./gc1/gc1.json", referenceTo: "map"}]};
    const fullZone = {name: "Goblin Cave", maps: [{identifier: "cave_entrance"}]};
    resolveZoneRefs.mockResolvedValue(fullZone);
    const positions = {"gc1-goblin-cave-entrance": {x: 10, y: 20}};

    const result = await saveZone("goblin-cave", zoneData, positions);

    expect(resolveZoneRefs).toHaveBeenCalledWith(zoneData, "zones/goblin-cave");
    expect(commitFiles).toHaveBeenCalledWith(
      {
        "zones/goblin-cave/goblin-cave.json": zoneData,
        "zones/goblin-cave/goblin-cave.full.json": fullZone,
        "zones/goblin-cave/goblin-cave.layout.json": {positions},
      },
      {message: "Update Goblin Cave"}
    );
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the zone has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    resolveZoneRefs.mockResolvedValue({});

    await saveZone("goblin-cave", {name: ""}, {});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-cave"});
  });

  it("commits a nested key's files at zones/<key>/<basename>.*", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    resolveZoneRefs.mockResolvedValue({name: "Deep Cave"});
    const zoneData = {name: "Deep Cave"};

    await saveZone("caves/deep-cave", zoneData, {});

    expect(resolveZoneRefs).toHaveBeenCalledWith(zoneData, "zones/caves/deep-cave");
    expect(commitFiles).toHaveBeenCalledWith(
      {
        "zones/caves/deep-cave/deep-cave.json": zoneData,
        "zones/caves/deep-cave/deep-cave.full.json": {name: "Deep Cave"},
        "zones/caves/deep-cave/deep-cave.layout.json": {positions: {}},
      },
      {message: "Update Deep Cave"}
    );
  });

  it("rejects, without committing anything, when a $ref fails to resolve", async () => {
    resolveZoneRefs.mockRejectedValue(new Error("Could not resolve $ref: zones/goblin-cave/missing/missing.json"));

    await expect(saveZone("goblin-cave", {name: "Goblin Cave"}, {})).rejects.toThrow(/Could not resolve \$ref/);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
