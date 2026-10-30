import { describe, expect, it } from "vitest";
import { objectShape, pushOut } from "./blocking.js";

describe("pushing walkers out of the way", () => {
  it("leaves walkers clear of everything where they are", () => {
    expect(pushOut(10, 0, 1, [{ circle: [0, 0, 2] }])).toEqual([10, 0]);
  });

  it("pushes them out of circles, the way they came in", () => {
    const [x, z] = pushOut(2, 0, 1, [{ circle: [0, 0, 2] }]);
    expect(x).toBeCloseTo(3);
    expect(z).toBeCloseTo(0);
  });

  it("pushes them out from a capsule's middle line", () => {
    const [x, z] = pushOut(0, 0.5, 1, [{ capsule: [-10, 0, 10, 0, 1] }]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(2);
  });

  it("pushes them out of rects, even from inside", () => {
    const rect = { rect: [0, 0, 0, 4, 1] };
    const [x, z] = pushOut(0, 0.5, 1, [rect]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(2);
    const [x2] = pushOut(4.5, 0, 1, [rect]);
    expect(x2).toBeCloseTo(5);
  });

  it("turns objects' footprints into shapes", () => {
    expect(objectShape({ at: [5, 6], yaw: 0, footprint: { circle: 2 } })).toEqual({ circle: [5, 6, 2] });
    const { capsule } = objectShape({ at: [0, 0], yaw: Math.PI / 2, footprint: { capsule: [1, 10] } });
    // Turned a quarter, its own x points north (-z).
    expect(capsule[1]).toBeCloseTo(10);
    expect(capsule[3]).toBeCloseTo(-10);
  });
});
