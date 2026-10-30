import { describe, expect, it } from "vitest";
import { CORNERS, decodePlatter, encodePlatter, indexIn, platterOf } from "./platter.js";

describe("platter files", () => {
  it("keep each tile's rendition", () => {
    const heights = Float32Array.from({ length: CORNERS * CORNERS }, (_, k) => k * 1.25 - 40);
    const colors = Uint8Array.from({ length: 192 }, (_, k) => k);
    const tiles = new Map([[indexIn(-3, 70), { heights, colors, hash: "0123456789abcdef" }]]);
    const back = decodePlatter(encodePlatter({ coords: platterOf(-3, 70), tiles }));
    expect(back.coords).toEqual([-1, 1]);
    expect([...back.tiles.keys()]).toEqual([indexIn(-3, 70)]);
    const tile = back.tiles.get(indexIn(-3, 70));
    expect([...tile.heights]).toEqual([...heights]);
    expect([...tile.colors]).toEqual([...colors]);
    expect(tile.hash).toBe("0123456789abcdef");
  });

  it("number tiles within their platter", () => {
    expect(indexIn(0, 0)).toBe(0);
    expect(indexIn(-1, 0)).toBe(63);
    expect(indexIn(1, 1)).toBe(65);
  });
});
