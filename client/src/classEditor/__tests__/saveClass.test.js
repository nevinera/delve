import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveClass} from "../saveClass";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

const availableAbilities = {
  "classes/puncher/punch": {ability: {name: "Punch", castTime: null}, assetMap: {}},
};

describe("saveClass", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits both classes/<key>.json and its resolved .full.json companion", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const classData = {
      name: "Puncher",
      powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}],
    };

    const result = await saveClass("puncher", classData, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(
      {
        "classes/puncher.json": classData,
        "classes/puncher.full.json": {name: "Puncher", powers: [{name: "Punch", castTime: null}]},
      },
      {message: "Update Puncher"}
    );
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the class has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveClass("puncher", {name: "", powers: []}, availableAbilities);

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update puncher"});
  });

  it("commits a nested key's JSON at classes/<key>.json and .full.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const classData = {name: "Druid", powers: []};

    await saveClass("hybrid/druid", classData, {});

    expect(commitFiles).toHaveBeenCalledWith(
      {"classes/hybrid/druid.json": classData, "classes/hybrid/druid.full.json": classData},
      {message: "Update Druid"}
    );
  });

  it("rejects, without committing anything, when a power references an ability that wasn't loaded", async () => {
    const classData = {name: "Puncher", powers: [{$ref: "../abilities/classes/puncher/missing.json", referenceTo: "ability"}]};

    await expect(saveClass("puncher", classData, availableAbilities)).rejects.toThrow(/No ability loaded/);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
