import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveZone} from "../saveZone";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveZone", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits the zone JSON at zones/<key>/<basename>.json with a name-based message", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const zoneData = {name: "Goblin Cave"};

    const result = await saveZone("goblin-cave", zoneData);

    expect(commitFiles).toHaveBeenCalledWith({"zones/goblin-cave/goblin-cave.json": zoneData}, {message: "Update Goblin Cave"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the zone has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveZone("goblin-cave", {name: ""});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-cave"});
  });

  it("commits a nested key's JSON at zones/<key>/<basename>.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const zoneData = {name: "Deep Cave"};

    await saveZone("caves/deep-cave", zoneData);

    expect(commitFiles).toHaveBeenCalledWith({"zones/caves/deep-cave/deep-cave.json": zoneData}, {message: "Update Deep Cave"});
  });
});
