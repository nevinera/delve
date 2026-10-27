import { describe, expect, it } from "vitest";
import { CELL_FT } from "../world/constants.js";
import { carveChannel, traceSource } from "./detailWater.js";

// Cells shaped by height(ci, cj), with water where `water` says, going anywhere `inside` allows.
function land(height, { water = () => false, inside = () => true } = {}) {
  const changed = new Map();
  return {
    height: (ci, cj) => changed.get(`${ci},${cj}`) ?? height(ci, cj),
    water,
    inside,
    editable: inside,
    apply(changes) {
      for (const [ci, cj, h] of changes) changed.set(`${ci},${cj}`, h);
    },
  };
}

describe("detail water", () => {
  it("runs downhill to the sea", () => {
    // Falling eastward 1 ft a cell, with the sea from cell 30 on.
    const cells = land((ci) => 30 - ci, { water: (ci) => ci >= 30 });
    const { wet, end } = traceSource(cells, [0, 0], 50);
    expect(end).toBe("water");
    expect(wet.get("10,0").dir).toEqual([1, 0]);
    expect(wet.get("10,0").surface).toBeGreaterThan(20);
  });

  it("keeps running when a big stream spreads over the cells ahead of it", () => {
    // Falling south-east, so the stream's spread covers cells downhill of it.
    const cells = land((ci, cj) => 100 - ci - cj * 0.7, { water: (ci) => ci >= 60 });
    const { end } = traceSource(cells, [0, 0], 200);
    expect(end).toBe("water");
  });

  it("fills a hollow up to its rim and spills on", () => {
    // A bowl 10 ft deep around (0, 0), its rim lowest to the east, then a slope down to the sea.
    const cells = land(
      (ci, cj) => {
        const d = Math.hypot(ci, cj);
        if (d < 5) return d * 2;
        if (ci > 0 && Math.abs(cj) <= 1) return 10 - (ci - 5);
        return 20;
      },
      { water: (ci) => ci > 20 },
    );
    const { wet, end } = traceSource(cells, [0, 0], 100);
    expect(end).toBe("water");
    expect(wet.get("0,0").surface).toBeCloseTo(cells.height(5, 0), 0);
    expect(wet.get("0,0").dir).toBeNull();
    expect(wet.get("10,0").dir).toEqual([1, 0]);
  });

  it("makes only a puddle from a small source", () => {
    const cells = land((ci, cj) => Math.hypot(ci, cj));
    const { wet, end } = traceSource(cells, [0, 0], 1);
    expect(end).toBe("dry");
    expect(wet.size).toBeLessThan(12);
  });

  it("stops where it may not go", () => {
    const cells = land((ci) => -ci, { inside: (ci) => ci < 5 });
    expect(traceSource(cells, [0, 0], 50).end).toBe("outside");
  });

  it("digs a channel that never rises along the way", () => {
    // Ground rising eastward, so the bed has to stay below the start.
    const cells = land((ci) => ci * 0.5);
    cells.apply(carveChannel(cells, [[0, 4], [40 * CELL_FT, 4]], { width: 8, depth: 2 }));
    expect(cells.height(0, 0)).toBeCloseTo(-2 + 0.25, 0);
    expect(cells.height(30, 0)).toBeLessThanOrEqual(cells.height(0, 0) + 0.01);
    // Untouched well to the side.
    expect(cells.height(10, 30)).toBe(5);
  });
});
