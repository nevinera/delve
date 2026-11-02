import { describe, expect, it } from "vitest";
import { Caves } from "./caves.js";
import { caveMesh } from "./caveMesh.js";
import { mouthClutter } from "./mouthClutter.js";

// A tunnel running out of a hillside that falls away to +x, its mouth at x = 150.
function mouth() {
  const hill = (x) => 5 + (128 - x) * 0.6;
  const caves = new Caves({ add() {} }, { heightAt: (x) => hill(x), cellHeightAt: (x) => hill(x) });
  for (let x = 110; x < 150; x += 3) caves.dig({ kind: "sphere", at: [x, 0, 128], radius: 7 });
  return caveMesh(0, 0, caves.world);
}
const kinds = (out) => new Set(out.map((o) => o.kind));

describe("clutter round cave mouths", () => {
  it("strews the ground and floor and juts rock from the faces, the same each time, with vines only where they grow", () => {
    const mesh = mouth();
    const entrance = (id) => ({ id, mouth: [150, -5, 128], yaw: 270, width: 14 });
    const rocky = mouthClutter(0, 0, mesh, { entrances: [entrance("e1")], biomeAt: () => "rocky" });
    expect(kinds(rocky)).toEqual(new Set(["pebble", "stone", "crag"]));
    expect(mouthClutter(0, 0, mesh, { entrances: [entrance("e1")], biomeAt: () => "rocky" })).toEqual(rocky);
    // Everything's near the mouth.
    for (const o of rocky) expect(Math.hypot(o.x - 150, o.z - 128)).toBeLessThan(40);
    // In forest there are twigs, and vines one way or another for each entrance, hanging down.
    const vines = new Set();
    for (const id of ["e1", "e2", "e3", "e4"]) {
      const forest = mouthClutter(0, 0, mesh, { entrances: [entrance(id)], biomeAt: () => "forest" });
      expect(kinds(forest).has("twig")).toBe(true);
      for (const o of forest) if (o.kind === "vine" || o.kind === "vineLoop") {
        vines.add(o.kind);
        expect(o.normal).toEqual([0, -1, 0]);
      }
    }
    expect(vines).toEqual(new Set(["vine", "vineLoop"]));
  });
});
