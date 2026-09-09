import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveClass} from "../saveClass";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveClass", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits the class JSON at classes/<key>.json with a name-based message", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const classData = {name: "Puncher", powers: []};

    const result = await saveClass("puncher", classData);

    expect(commitFiles).toHaveBeenCalledWith({"classes/puncher.json": classData}, {message: "Update Puncher"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the class has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveClass("puncher", {name: ""});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update puncher"});
  });

  it("commits a nested key's JSON at classes/<key>.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const classData = {name: "Druid"};

    await saveClass("hybrid/druid", classData);

    expect(commitFiles).toHaveBeenCalledWith({"classes/hybrid/druid.json": classData}, {message: "Update Druid"});
  });
});
