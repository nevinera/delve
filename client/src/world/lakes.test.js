import { describe, it, expect } from "vitest";
import { fillLake, interiorPoint, outline } from "./lakes.js";
import { TILE_FT } from "./constants.js";

// A bowl 2 tiles wide centred on (1, 1) tiles, 10ft deep at the middle and rising 1ft per 32ft
// out from there, with the sea beyond 3 tiles out.
function bowl(x, z) {
  const d = Math.hypot(x - TILE_FT, z - TILE_FT);
  return d > 3 * TILE_FT ? -5 : 10 + d / 32;
}

describe("lakes", () => {
  it("fills the ground below its level that joins its seed", () => {
    const lake = fillLake(bowl, { seed: [1, 1], level: 14 });
    expect(lake.status).toBe("ok");
    // Ground under 14ft: within 128ft of the middle, about 200 points 16ft apart.
    expect(lake.cells.length).toBeGreaterThan(180);
    expect(lake.cells.length).toBeLessThan(220);
    expect(lake.region).toHaveLength(1);
  });

  it("finds the water from a seed near the shore", () => {
    expect(fillLake(bowl, { seed: [1 + 120 / TILE_FT, 1], level: 14 }).cells.length).toBeGreaterThan(180);
  });

  it("stays in its seed's hollow when a lower one lies close by", () => {
    // A 4ft-deep pool at the seed, and past its rim, 48ft east, a channel down to the sea.
    const ground = (x, z) => (Math.abs(x - 2 * TILE_FT - 48) < 8 ? -20 : Math.hypot(x - 2 * TILE_FT, z - 2 * TILE_FT) < 20 ? 96 : 100);
    const lake = fillLake(ground, { seed: [2, 2], level: 98 });
    expect(lake.status).toBe("ok");
    expect(lake.cells.length).toBeLessThan(20);
  });

  it("is dry when its seed is above its level, and spills when it reaches the sea", () => {
    expect(fillLake(bowl, { seed: [1, 1], level: 5 }).status).toBe("dry");
    expect(fillLake(bowl, { seed: [1, 1], level: 100 }).status).toBe("spills");
  });

  it("picks a seed well inside a region", () => {
    const ring = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]; // an L
    const [x, z] = interiorPoint([[ring]]);
    expect(x < 1 || z < 1).toBe(true);
    expect(x > 0 && z > 0).toBe(true);
  });
});

describe("lake outlines", () => {
  it("goes round a block of cells, with islands as holes", () => {
    const cells = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== 2 || j !== 2) cells.push([i, j]);
    const region = outline(cells);
    expect(region).toHaveLength(1);
    expect(region[0]).toHaveLength(2);
  });

  it("gives separate pieces separate polygons", () => {
    expect(outline([[0, 0], [5, 5]])).toHaveLength(2);
  });
});
