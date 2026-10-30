import { describe, expect, it } from "vitest";
import { CORNERS } from "./platter.js";
import { SEA_FLOOR_FT, plateRendition } from "./rendition.js";

// A tile whose ground rises 1 ft a chunk eastward from `base`, all one color.
const tile = (base, rgb, hash = "1".repeat(16)) => ({
  heights: Float32Array.from({ length: CORNERS * CORNERS }, (_, k) => base + (k % CORNERS)),
  colors: Uint8Array.from({ length: 192 }, (_, k) => rgb[k % 3]),
  hash,
});

describe("plate renditions", () => {
  it("take tile corners' heights and tiles' mean colors", () => {
    const plate = plateRendition((i, j) => (i < 2 && j === 0 ? tile(100 + i * 8, [10, 20, 30]) : null));
    expect(plate.heights[0]).toBe(100);
    expect(plate.heights[1]).toBe(108);
    expect(plate.heights[2]).toBe(116);
    expect(plate.heights[3]).toBe(SEA_FLOOR_FT);
    expect(plate.heights[CORNERS + 1]).toBe(108);
    expect([...plate.colors.slice(0, 6)]).toEqual([10, 20, 30, 10, 20, 30]);
    expect([...plate.colors.slice(6, 9)]).toEqual([0, 0, 0]);
  });

  it("change hash when a tile does", () => {
    const a = plateRendition((i, j) => (i === 0 && j === 0 ? tile(0, [1, 1, 1]) : null));
    const b = plateRendition((i, j) => (i === 0 && j === 0 ? tile(0, [1, 1, 1], "2".repeat(16)) : null));
    expect(a.hash).not.toBe(b.hash);
  });

  it("aren't made for plates with no tiles", () => {
    expect(plateRendition(() => null)).toBeNull();
  });
});
