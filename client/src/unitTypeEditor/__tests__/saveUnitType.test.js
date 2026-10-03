import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveUnitType} from "../saveUnitType";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveUnitType", () => {
  beforeEach(() => {
    commitFiles.mockReset();
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
  });

  it("commits just unit_types/<key>.json, with its powers inline", async () => {
    const unitTypeData = {name: "Goblin Raider", powers: [{name: "Slash", castTime: null}]};

    const result = await saveUnitType("goblin-raider", unitTypeData);

    expect(commitFiles).toHaveBeenCalledWith({"unit_types/goblin-raider.json": unitTypeData}, {message: "Update Goblin Raider"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the unit type has no name", async () => {
    await saveUnitType("goblin-raider", {name: "", powers: []});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-raider"});
  });

  it("uses a given commit message instead of the default", async () => {
    await saveUnitType("goblin-raider", {name: "Goblin Raider", powers: []}, {}, "Custom message");

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Custom message"});
  });

  it("deletes the given paths in the same commit", async () => {
    const unitTypeData = {name: "Raider", powers: []};

    await saveUnitType("goblins/raider", unitTypeData, {deletePaths: ["unit_types/goblins/raider.full.json"]});

    expect(commitFiles).toHaveBeenCalledWith(
      {"unit_types/goblins/raider.json": unitTypeData, "unit_types/goblins/raider.full.json": null},
      {message: "Update Raider"}
    );
  });

  describe("pending token image uploads", () => {
    it("commits each alongside the JSON, at its repo path", async () => {
      const unitTypeData = {name: "Goblin Raider", tokenImageUrl: ["../tokens/unit/goblin-raider.webp"], powers: []};
      const file = new File(["fake"], "goblin-raider.webp");

      await saveUnitType("goblin-raider", unitTypeData, {tokenFiles: {"tokens/unit/goblin-raider.webp": file}});

      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/goblin-raider.json": unitTypeData, "tokens/unit/goblin-raider.webp": file},
        {message: "Update Goblin Raider"}
      );
    });
  });

  describe("pending power asset uploads", () => {
    it("commits each upload at its field's path, relative to the unit type's file", async () => {
      const unitTypeData = {
        name: "Raider",
        powers: [{name: "Slash", iconURL: "../graphics/icons/slash.png", graphicEffects: [{sourceURL: "../graphics/slash.webp"}]}],
      };
      const icon = new File(["i"], "slash.png");
      const graphic = new File(["g"], "slash.webp");

      await saveUnitType("raider", unitTypeData, {powerFiles: {0: {iconURL: icon, "graphicEffects[0].sourceURL": graphic}}});

      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/raider.json": unitTypeData, "graphics/icons/slash.png": icon, "graphics/slash.webp": graphic},
        {message: "Update Raider"}
      );
    });

    it("rejects when an upload's field is blank", async () => {
      const unitTypeData = {name: "Raider", powers: [{name: "Slash", iconURL: ""}]};

      await expect(saveUnitType("raider", unitTypeData, {powerFiles: {0: {iconURL: new File(["i"], "x.png")}}})).rejects.toThrow(/Slash iconURL/);
      expect(commitFiles).not.toHaveBeenCalled();
    });
  });
});
