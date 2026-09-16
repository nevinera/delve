import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveMap} from "../saveMap";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveMap", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits the map JSON at zones/<key>/<basename>.json with a name-based message", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const mapData = {name: "Goblin Cave Entrance", imageUrl: null};

    const result = await saveMap("goblin-cave/gc1-goblin-cave-entrance", mapData, null);

    expect(commitFiles).toHaveBeenCalledWith(
      {"zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json": mapData},
      {message: "Update Goblin Cave Entrance"}
    );
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the map has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveMap("goblin-cave/gc1-goblin-cave-entrance", {name: ""}, null);

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update goblin-cave/gc1-goblin-cave-entrance"});
  });

  it("also commits a pending image file alongside the JSON, resolved against the map's own directory", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const mapData = {name: "Goblin Cave Entrance", imageUrl: "gc1-goblin-cave-entrance.webp"};
    const file = new File(["x"], "background.webp");

    await saveMap("goblin-cave/gc1-goblin-cave-entrance", mapData, file);

    expect(commitFiles).toHaveBeenCalledWith(
      {
        "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json": mapData,
        "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.webp": file,
      },
      {message: "Update Goblin Cave Entrance"}
    );
  });

  it("throws, without calling commitFiles, when an image file is pending but imageUrl is unset", async () => {
    const mapData = {name: "Goblin Cave Entrance", imageUrl: null};
    const file = new File(["x"], "background.webp");

    await expect(saveMap("goblin-cave/gc1-goblin-cave-entrance", mapData, file)).rejects.toThrow(/background image/);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});
