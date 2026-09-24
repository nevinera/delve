import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveUnitType} from "../saveUnitType";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

const availableAbilities = {
  "units/goblin-raider/slash": {ability: {name: "Slash", castTime: null}, assetMap: {}},
};

describe("saveUnitType", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits both unit_types/<key>.json and its resolved .full.json companion", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const unitTypeData = {
      name: "Goblin Raider",
      powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}],
    };

    const result = await saveUnitType("goblin-raider", unitTypeData, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(
      {
        "unit_types/goblin-raider.json": unitTypeData,
        "unit_types/goblin-raider.full.json": {name: "Goblin Raider", powers: [{name: "Slash", castTime: null}]},
      },
      {message: "Update Goblin Raider"}
    );
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the unit type has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveUnitType("goblin-raider", {name: "", powers: []}, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-raider"});
  });

  it("commits a nested key's JSON at unit_types/<key>.json and .full.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const unitTypeData = {name: "Raider", powers: []};

    await saveUnitType("goblins/raider", unitTypeData, {});

    expect(commitFiles).toHaveBeenCalledWith(
      {"unit_types/goblins/raider.json": unitTypeData, "unit_types/goblins/raider.full.json": unitTypeData},
      {message: "Update Raider"}
    );
  });

  it("rejects, without committing anything, when a power references an ability that wasn't loaded", async () => {
    const unitTypeData = {name: "Goblin Raider", powers: [{$ref: "../abilities/units/goblin-raider/missing.json", referenceTo: "ability"}]};

    await expect(saveUnitType("goblin-raider", unitTypeData, availableAbilities)).rejects.toThrow(/No ability loaded/);
    expect(commitFiles).not.toHaveBeenCalled();
  });

  describe("pending token image uploads", () => {
    it("commits a pending upload alongside the JSON, at the slot's own path", async () => {
      commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
      const unitTypeData = {name: "Goblin Raider", tokenImageUrl: ["../tokens/unit/goblin-raider.webp"], powers: []};
      const file = new File(["fake"], "goblin-raider.webp");

      await saveUnitType("goblin-raider", unitTypeData, {}, {0: file});

      expect(commitFiles).toHaveBeenCalledWith(
        {
          "unit_types/goblin-raider.json": unitTypeData,
          "unit_types/goblin-raider.full.json": unitTypeData,
          "tokens/unit/goblin-raider.webp": file,
        },
        {message: "Update Goblin Raider"}
      );
    });

    it("resolves a nested key's token path relative to its own unit_types subdirectory", async () => {
      commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
      // A key with one "/" (unit_types/goblins/raider.json) needs one extra
      // ".." beyond the flat-key case to climb back out to the repo root -
      // same depth-per-segment reasoning as powerRefs.js's relativePrefix.
      const unitTypeData = {name: "Raider", tokenImageUrl: ["../../tokens/unit/raider.webp"], powers: []};
      const file = new File(["fake"], "raider.webp");

      await saveUnitType("goblins/raider", unitTypeData, {}, {0: file});

      expect(commitFiles).toHaveBeenCalledWith(
        expect.objectContaining({"tokens/unit/raider.webp": file}),
        {message: "Update Raider"}
      );
    });

    it("rejects, without committing anything, when a pending upload's slot has been cleared", async () => {
      const unitTypeData = {name: "Goblin Raider", tokenImageUrl: [""], powers: []};
      const file = new File(["fake"], "goblin-raider.webp");

      await expect(saveUnitType("goblin-raider", unitTypeData, {}, {0: file})).rejects.toThrow(/Set a path before saving/);
      expect(commitFiles).not.toHaveBeenCalled();
    });

    it("commits normally when there are no pending uploads", async () => {
      commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
      const unitTypeData = {name: "Goblin Raider", tokenImageUrl: [], powers: []};

      await saveUnitType("goblin-raider", unitTypeData, {});

      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/goblin-raider.json": unitTypeData, "unit_types/goblin-raider.full.json": unitTypeData},
        {message: "Update Goblin Raider"}
      );
    });
  });
});
