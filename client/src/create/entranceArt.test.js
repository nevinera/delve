import { describe, expect, it } from "vitest";
import { ENTRANCE_DEFAULTS, entranceEnd } from "./caveLayout.js";
import { collarMesh } from "./entranceArt.js";

const entrance = (details) => {
  const e = { ...ENTRANCE_DEFAULTS, id: "n1", mouth: [0, 0, 0], yaw: 90, ...details };
  return { ...e, at: entranceEnd(e) };
};

describe("entrance art", () => {
  it("rings a tube where it meets the hillside", () => {
    // A hillside rising 0.6 ft for each foot east, the tube running east into it.
    const hill = (x) => 0.6 * x;
    for (const style of ["natural", "mine"]) {
      const mesh = collarMesh(entrance({ style }), hill);
      expect(mesh.indices.length).toBeGreaterThan(0);
      // It sits about where the tube goes into the hill: none of it out past the mouth or deep in.
      const xs = mesh.positions.filter((_, i) => i % 3 === 0);
      expect(Math.min(...xs)).toBeGreaterThan(-6);
      expect(Math.max(...xs)).toBeLessThan(30);
    }
  });

  it("makes none where the tube never meets the ground", () => {
    expect(collarMesh(entrance(), () => -100)).toBe(null);
  });
});
