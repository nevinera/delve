import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveClass} from "../saveClass";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveClass", () => {
  beforeEach(() => {
    commitFiles.mockReset();
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
  });

  it("commits just classes/<key>.json, with its powers inline", async () => {
    const classData = {name: "Puncher", powers: [{name: "Punch"}]};

    const result = await saveClass("puncher", classData);

    expect(commitFiles).toHaveBeenCalledWith({"classes/puncher.json": classData}, {message: "Update Puncher"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the class has no name", async () => {
    await saveClass("puncher", {name: "", powers: []});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update puncher"});
  });

  it("uses a given commit message instead of the default", async () => {
    await saveClass("puncher", {name: "Puncher", powers: []}, {}, "Custom message");

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Custom message"});
  });

  it("deletes the given paths in the same commit", async () => {
    const classData = {name: "Druid", powers: []};

    await saveClass("hybrid/druid", classData, {deletePaths: ["classes/hybrid/druid.full.json"]});

    expect(commitFiles).toHaveBeenCalledWith(
      {"classes/hybrid/druid.json": classData, "classes/hybrid/druid.full.json": null},
      {message: "Update Druid"}
    );
  });

  it("commits a power's pending upload at its field's path", async () => {
    const classData = {name: "Puncher", powers: [{name: "Punch", iconURL: "../graphics/icons/punch.png"}]};
    const icon = new File(["i"], "punch.png");

    await saveClass("puncher", classData, {powerFiles: {0: {iconURL: icon}}});

    expect(commitFiles).toHaveBeenCalledWith({"classes/puncher.json": classData, "graphics/icons/punch.png": icon}, {message: "Update Puncher"});
  });

  it("rejects without committing when an upload's field is blank", async () => {
    const classData = {name: "Puncher", powers: [{name: "Punch", iconURL: ""}]};

    await expect(saveClass("puncher", classData, {powerFiles: {0: {iconURL: new File(["i"], "x.png")}}})).rejects.toThrow(/Punch iconURL/);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
