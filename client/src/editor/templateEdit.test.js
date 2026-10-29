import { gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { CELLS } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { SCRATCH, SCRATCH_FT, scratchTemplate, scratchWorld } from "./templateEdit.js";
import { surfacePath } from "./thumbnails.js";

const floor = { at: [0, 1, 0], turn: [0, 0, 0], outline: [[0, 0], [10, 0], [10, 10], [0, 10]], thickness: 1, surface: "floorboards" };
const hut = { id: "hut00001", name: "Hut", slabs: [floor], objects: [{ type: "rock", at: [5, 5], yaw: 0, scale: 1, y: 1 }], ground: [[0, 0, 0], [1, 0, 0.5]] };

const tilesOf = ({ world, continent, size }) => {
  const tiles = [];
  for (let tz = 0; tz < size; tz++) for (let tx = 0; tx < size; tx++) tiles.push(decodeTile(gunzipSync(world.files.get(surfacePath(continent, tx, tz)))));
  return tiles;
};

describe("editing a template", () => {
  it("stands it in the middle of flat tiles of its own, ringed round", () => {
    const scratch = scratchWorld(hut);
    expect(scratch.continent).toBe(SCRATCH);
    expect(scratch.size).toBe(3);
    expect(scratch.world.files.size).toBe(25);
    const middle = tilesOf(scratch)[4];
    expect(middle.slabs).toEqual([{ ...floor, at: [768, 101, 768] }]);
    expect(middle.objects).toMatchObject([{ type: "rock", at: [773, 773], y: 101 }]);
    expect(middle.objects[0].template).toBeUndefined();
    // Cell 96, 96 is the anchor's: the tile's cell 32, 32.
    expect(middle.layers.height[32 * CELLS + 32]).toBe(SCRATCH_FT);
    expect(middle.layers.height[32 * CELLS + 33]).toBe(SCRATCH_FT + 0.5);
    expect(middle.layers.height[0]).toBe(SCRATCH_FT);
  });

  it("opens a big one in a bigger window", () => {
    expect(scratchWorld({ ...hut, slabs: [{ ...floor, at: [900, 0, 0] }] }).size).toBe(5);
  });

  it("takes back what's on the tiles as it was", () => {
    // Its anchor in its middle, on its ground's mean height, as capturing puts it.
    const square = { ...floor, at: [-5, 1, -5] };
    const shed = { ...hut, slabs: [square], objects: [{ ...hut.objects[0], at: [0, 0] }], ground: [[-1, -1, 0], [0, -1, 0], [-1, 0, 0], [0, 0, 0]] };
    const scratch = scratchWorld(shed);
    const tiles = tilesOf(scratch);
    const height = (ci, cj) => tiles.find((t) => t.coords[0] === Math.floor(ci / CELLS) && t.coords[1] === Math.floor(cj / CELLS)).layers.height[(cj % CELLS) * CELLS + (ci % CELLS)];
    const back = scratchTemplate(tiles, height, { id: hut.id, name: hut.name, withGround: true });
    // A rock left to color itself is given its colors.
    expect({ ...back, objects: back.objects.map(({ colors: _, ...o }) => o) }).toEqual(shed);
    expect(scratchTemplate(tiles.map((t) => ({ ...t, objects: [] })), height, { id: hut.id, name: hut.name })).toBeNull();
  });
});
