import { describe, it, expect } from "vitest";
import { changedTiles } from "./changes.js";

const square = (x0, z0, x1, z1) => [[[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]]];
const zone = (extra = {}) => ({ region: square(0, 0, 20, 20), pins: [], strokes: [], ...extra });
const has = (tiles, tx, tz) => tiles.has(`${tx},${tz}`);

describe("changedTiles", () => {
  it("finds nothing when nothing changed", () => {
    expect(changedTiles(zone(), zone()).size).toBe(0);
  });

  it("ignores info pins", () => {
    const after = zone({ pins: [{ id: "p1", kind: "info", at: [5, 5], name: "Camp" }] });
    expect(changedTiles(zone(), after).size).toBe(0);
  });

  it("covers a height pin's reach and the ring around it, and no further", () => {
    const after = zone({ pins: [{ id: "p1", kind: "height", at: [10.5, 10.5], height: 80 }] });
    const tiles = changedTiles(zone(), after);
    expect(has(tiles, 10, 10)).toBe(true);
    expect(has(tiles, 15, 10)).toBe(true);
    expect(has(tiles, 18, 10)).toBe(false);
  });

  it("covers both where a pin was and where it went", () => {
    const pin = { id: "p1", kind: "height", at: [2.5, 2.5], height: 80 };
    const tiles = changedTiles(zone({ pins: [pin] }), zone({ pins: [{ ...pin, at: [17.5, 17.5] }] }));
    expect(has(tiles, 2, 2)).toBe(true);
    expect(has(tiles, 17, 17)).toBe(true);
    expect(has(tiles, 10, 10)).toBe(false);
  });

  it("covers a river's whole length", () => {
    const river = { id: "s1", kind: "river", points: [[1.5, 10.5], [18.5, 10.5]], width: 30 };
    const tiles = changedTiles(zone(), zone({ strokes: [river] }));
    for (let tx = 1; tx <= 18; tx++) expect(has(tiles, tx, 10)).toBe(true);
    expect(has(tiles, 10, 13)).toBe(false);
  });

  it("covers the shore around a moved region edge, not the whole region", () => {
    const tiles = changedTiles(zone(), zone({ region: square(0, 0, 21, 20) }));
    expect(has(tiles, 20, 10)).toBe(true);
    expect(has(tiles, 17, 10)).toBe(true);
    expect(has(tiles, 5, 10)).toBe(false);
  });

  it("covers every tile of a brand-new region", () => {
    const triangle = [[[[0, 0], [10, 0], [0, 10]]]];
    const tiles = changedTiles(null, { region: triangle, pins: [], strokes: [] });
    expect(has(tiles, 0, 9)).toBe(true);
    expect(has(tiles, 9, 0)).toBe(true);
  });
});
