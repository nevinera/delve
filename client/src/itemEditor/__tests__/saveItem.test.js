import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveItem} from "../saveItem";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveItem", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits items/<key>.json only, with no .full.json companion", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const itemData = {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand", elvl: 584};

    const result = await saveItem("sword-of-doom", itemData);

    expect(commitFiles).toHaveBeenCalledWith({"items/sword-of-doom.json": itemData}, {message: "Update Sword of Doom"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the item has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveItem("sword-of-doom", {name: ""});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update sword-of-doom"});
  });

  it("commits a nested key's JSON at items/<key>.json", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const itemData = {name: "Bulwark", slot: "off_hand"};

    await saveItem("weapons/bulwark", itemData);

    expect(commitFiles).toHaveBeenCalledWith({"items/weapons/bulwark.json": itemData}, {message: "Update Bulwark"});
  });
});
