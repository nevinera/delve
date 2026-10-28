import { describe, expect, it } from "vitest";
import { Editor } from "./editor.js";
import { CELLS, TILE_FT } from "../world/constants.js";
import { LAND_FT, LandGrid, PER_TILE } from "../world/landGrid.js";

// An island over tiles (10, -8) to (16, 0), with a valley along z = -3.5 tiles falling west to the
// sea and a river down it, and tiles (13, -4) to (13, -1) shaped by hand.
function editorOver(dig) {
  const land = new LandGrid();
  for (let gz = -10 * PER_TILE; gz <= 2 * PER_TILE; gz++) {
    for (let gx = 8 * PER_TILE; gx <= 18 * PER_TILE; gx++) {
      const [x, z] = [gx * LAND_FT, gz * LAND_FT];
      const inside = Math.min(x - 10 * TILE_FT, 16 * TILE_FT - x, z + 8 * TILE_FT, -z);
      land.set(gx, gz, Math.max(-50, Math.min(inside * 0.25 - 20, 20 + (x - 10 * TILE_FT) / 40 + Math.abs(z + 3.5 * TILE_FT) / 10)));
    }
  }
  const heights = new Map();
  for (let tz = -4; tz <= -1; tz++) {
    const height = new Float32Array(CELLS * CELLS);
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) height[j * CELLS + i] = land.heightAt((13 * CELLS + i + 0.5) * 8, (tz * CELLS + j + 0.5) * 8);
    heights.set(`13,${tz}`, height);
  }
  dig?.(heights);
  const editor = Object.create(Editor.prototype);
  Object.assign(editor, {
    land,
    continent: "main",
    sketch: { water: { rivers: [{ id: "w1", points: [[15.5, -3.5], [14, -3.5], [12, -3.5], [10.3, -3.5]], width: 12 }], lakes: [] } },
    editedHeights: () => heights,
    groundKey: () => String(Math.random()),
    editedTiles: () => new Set(heights.keys()),
    saveSketch() {},
    detail: { keys: () => ["13,-4"] },
  });
  return editor;
}

// A trench from the river south down to the sea, at the 32nd column of tiles (13, -4) to (13, -1).
const trench = (heights) => {
  const top = -4 * CELLS + 30;
  for (const [key, height] of heights) {
    const tz = Number(key.split(",")[1]);
    for (let j = 0; j < CELLS; j++) {
      const row = tz * CELLS + j;
      if (row < top) continue;
      for (const i of [31, 32, 33]) height[j * CELLS + i] = Math.min(height[j * CELLS + i], 15 - (row - top) * 0.2);
    }
  }
};
const cells = [[13 * CELLS + 32, -4 * CELLS + 31]];

describe("reflowing water", () => {
  it("diverts a river down a trench dug beside it", () => {
    const editor = editorOver(trench);
    expect(editor.reflowWater(cells)).toEqual(["13,-4"]);
    const [river] = editor.sketch.water.rivers;
    expect(river.points.at(-1)[1]).toBeGreaterThan(-0.2);
    expect(river.id).toBe("w1");
    expect(river.points[0]).toEqual([15.5, -3.5]);
    // It turns south down the trench, and no longer reaches the west coast along its old course.
    expect(Math.max(...river.points.map(([, z]) => z))).toBeGreaterThan(-3.2);
    expect(river.points.some(([x, z]) => x < 12 && Math.abs(z + 3.5) < 0.05)).toBe(false);
  });

  it("dries up the water the old course fed, and nothing else", () => {
    const editor = editorOver(trench);
    const { water } = editor.sketch;
    water.rivers = [
      { id: "w1", points: [[15.5, -3.5], [14, -3.5], [12, -3.5]], width: 12 },
      { id: "w2", points: [[12, -3.5], [10.3, -3.5]], width: 14 },
      { id: "w3", points: [[15.5, -6], [10.3, -6]], width: 12 },
    ];
    editor.reflowWater(cells);
    const ids = editor.sketch.water.rivers.map((r) => r.id);
    expect(ids).toContain("w1");
    expect(ids).toContain("w3");
    expect(ids).not.toContain("w2");
  });

  it("finds its way back once the trench is filled", () => {
    const dug = editorOver(trench);
    dug.reflowWater(cells);
    const filled = editorOver();
    filled.sketch = dug.sketch;
    // Filling it in touches the cells all down it.
    filled.reflowWater(Array.from({ length: 200 }, (_, n) => [13 * CELLS + 32, -4 * CELLS + 31 + n]));
    const all = filled.sketch.water.rivers.flatMap((r) => r.points);
    expect(all.some(([x]) => x < 11)).toBe(true);
  });

  it("leaves water alone when nothing near it changed", () => {
    expect(editorOver(trench).reflowWater([[13 * CELLS + 32, -4 * CELLS + 60]])).toBeNull();
  });

  it("lets a lake down to a cut through its rim, and runs it out through the cut", () => {
    // A plateau at 60ft with a bowl 20ft deep in the middle of tile (13, -4), and a ditch at 45ft
    // from the bowl east to the tile's edge.
    const land = new LandGrid();
    const middle = [13.5 * TILE_FT, -3.5 * TILE_FT];
    const ground = (x, z) => Math.min(60, 40 + Math.hypot(x - middle[0], z - middle[1]) / 5);
    for (let gz = -6 * PER_TILE; gz <= -2 * PER_TILE; gz++) for (let gx = 11 * PER_TILE; gx <= 16 * PER_TILE; gx++) land.set(gx, gz, ground(gx * LAND_FT, gz * LAND_FT));
    const height = new Float32Array(CELLS * CELLS);
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) height[j * CELLS + i] = ground((13 * CELLS + i + 0.5) * 8, (-4 * CELLS + j + 0.5) * 8);
    for (let i = 32; i < CELLS; i++) for (const j of [31, 32]) height[j * CELLS + i] = Math.min(height[j * CELLS + i], 45 - (i - 32) * 0.1);
    const editor = editorOver();
    Object.assign(editor, { land, editedHeights: () => new Map([["13,-4", height]]), editedTiles: () => new Set(["13,-4"]) });
    editor.sketch = { water: { rivers: [], lakes: [{ id: "l1", seed: [13.5, -3.5], level: 55 }] } };
    expect(editor.reflowWater([[13 * CELLS + 50, -4 * CELLS + 31]])).toEqual(["13,-4"]);
    const [lake] = editor.sketch.water.lakes;
    expect(lake.id).toBe("l1");
    expect(lake.level).toBeLessThan(46);
    expect(editor.sketch.water.rivers.length).toBeGreaterThan(0);
  });
});
