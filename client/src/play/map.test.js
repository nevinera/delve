import { describe, expect, it } from "vitest";
import { platterImage } from "./map.js";

const pixel = (image, x, y) => [...image.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 3)];

describe("the map's platter images", () => {
  const water = { level: new Float32Array(64).fill(NaN), type: new Uint8Array(64) };
  water.level[1] = 3;
  const steep = new Uint8Array(64);
  [steep[2], steep[3]] = [63, 21];
  const image = platterImage({ tiles: new Map([[65, { water, steep }]]) }); // the tile 1 east and 1 south

  it("draw land, and water the same as the sea past the tiles", () => {
    const [land, wet, sea] = [pixel(image, 8, 8), pixel(image, 9, 8), pixel(image, 0, 0)];
    expect(wet).not.toEqual(land);
    expect(wet).toEqual(sea);
  });

  it("darken land by how much of it is too steep to climb", () => {
    const [flat, some, all] = [pixel(image, 8, 8), pixel(image, 11, 8), pixel(image, 10, 8)];
    expect(some[0]).toBeLessThan(flat[0]);
    expect(all[0]).toBeLessThan(some[0]);
  });
});
