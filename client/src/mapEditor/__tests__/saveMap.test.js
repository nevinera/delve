import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveMap} from "../saveMap";
import {commitFiles} from "../../github/commitFiles";
import {loadSvgToCanvas} from "../../game/svgRaster";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

vi.mock("../../game/svgRaster", () => ({
  loadSvgToCanvas: vi.fn(),
}));

// A fake canvas whose toBlob immediately resolves with `blob` (a real
// canvas 2D context isn't available in jsdom - see svgRaster.test.js's own
// note - so loadSvgToCanvas itself is mocked, not exercised here).
function fakeCanvas(blob) {
  return {toBlob: (cb) => cb(blob)};
}

describe("saveMap", () => {
  beforeEach(() => {
    commitFiles.mockReset();
    loadSvgToCanvas.mockReset();
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

  it("generates and commits a thumbnail alongside a pending image, adding thumbnailUrl to the committed JSON", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const thumbBlob = new Blob(["thumb"]);
    loadSvgToCanvas.mockResolvedValue(fakeCanvas(thumbBlob));
    const mapData = {name: "Goblin Cave Entrance", imageUrl: "gc1-goblin-cave-entrance.webp", feetDimensions: {width: 30, height: 22.5}};
    const file = new File(["x"], "background.webp");

    await saveMap("goblin-cave/gc1-goblin-cave-entrance", mapData, file);

    expect(loadSvgToCanvas).toHaveBeenCalledWith(expect.any(String), mapData.feetDimensions, {maxDimension: 256});
    expect(commitFiles).toHaveBeenCalledWith(
      {
        "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.webp": file,
        "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.thumb.webp": thumbBlob,
        "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json": {...mapData, thumbnailUrl: "gc1-goblin-cave-entrance.thumb.webp"},
      },
      {message: "Update Goblin Cave Entrance"}
    );
  });

  it("saves without a thumbnailUrl when thumbnail generation fails, rather than blocking the save", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    loadSvgToCanvas.mockRejectedValue(new Error("could not rasterize"));
    const mapData = {name: "Goblin Cave Entrance", imageUrl: "gc1-goblin-cave-entrance.webp"};
    const file = new File(["x"], "background.webp");

    await saveMap("goblin-cave/gc1-goblin-cave-entrance", mapData, file);

    expect(commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({"zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json": mapData}),
      {message: "Update Goblin Cave Entrance"}
    );
  });
});
