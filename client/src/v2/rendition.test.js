import { describe, expect, it } from "vitest";
import { CORNERS } from "./platter.js";
import { SEA_FLOOR_FT, plateRendition } from "./rendition.js";

// A tile whose ground rises 1 ft a chunk eastward from `base`.
const tile = (base, hash = "1".repeat(16)) => ({
  heights: Float32Array.from({ length: CORNERS * CORNERS }, (_, k) => base + (k % CORNERS)),
  hash,
});

describe("plate renditions", () => {
  it("take tile corners' heights", () => {
    const plate = plateRendition((i, j) => (i < 2 && j === 0 ? tile(100 + i * 8) : null));
    expect(plate.heights[0]).toBe(100);
    expect(plate.heights[1]).toBe(108);
    expect(plate.heights[2]).toBe(116);
    expect(plate.heights[3]).toBe(SEA_FLOOR_FT);
    expect(plate.heights[CORNERS + 1]).toBe(108);
  });

  it("change hash when a tile does", () => {
    const a = plateRendition((i, j) => (i === 0 && j === 0 ? tile(0) : null));
    const b = plateRendition((i, j) => (i === 0 && j === 0 ? tile(0, "2".repeat(16)) : null));
    expect(a.hash).not.toBe(b.hash);
  });

  it("aren't made for plates with no tiles", () => {
    expect(plateRendition(() => null)).toBeNull();
  });
});
