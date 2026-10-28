import { describe, expect, it } from "vitest";
import { CELL_FT } from "../world/constants.js";
import { carveChannel } from "./detailWater.js";

// Cells shaped by height(ci, cj), all editable.
function land(height) {
  const changed = new Map();
  return {
    height: (ci, cj) => changed.get(`${ci},${cj}`) ?? height(ci, cj),
    editable: () => true,
    apply(changes) {
      for (const [ci, cj, h] of changes) changed.set(`${ci},${cj}`, h);
    },
  };
}

describe("channels", () => {
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
