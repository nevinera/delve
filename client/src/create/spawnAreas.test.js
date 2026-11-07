import { describe, expect, it } from "vitest";
import { inside } from "../v2/biomes.js";
import { mobsFor, polygonArea, scatter } from "./spawnAreas.js";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const square = (r) => [[0, 0], [r, 0], [r, r], [0, r]];
const ids = () => {
  let n = 0;
  return () => `m${String(++n).padStart(7, "0")}`;
};

describe("spawn areas", () => {
  it("measure their areas", () => {
    expect(polygonArea(square(512))).toBe(512 * 512);
    expect(polygonArea([[0, 0], [10, 0], [0, 10]])).toBe(50);
    expect(mobsFor(2, square(1024))).toBe(8);
  });

  it("scatter each spawn's mobs inside the area, on ground you can stand on, apart", () => {
    const spawnArea = { id: "spwn0001", spawns: [{ creature: "gobl0001", density: 4, levels: [1, 3], respawn: 120 }] };
    // The west half is water.
    const mobs = scatter(spawnArea, square(512), { standAt: (x) => (x < 256 ? null : 10), id: ids(), packId: ids(), random: seeded() });
    expect(mobs).toHaveLength(4);
    for (const mob of mobs) {
      expect(inside(square(512), mob.at[0], mob.at[2])).toBe(true);
      expect(mob.at[0]).toBeGreaterThanOrEqual(256);
      expect(mob).toMatchObject({ creature: "gobl0001", levels: [1, 3], respawn: 120, spawnArea: "spwn0001" });
      expect(mob.at[1]).toBe(10);
    }
    for (const a of mobs) for (const b of mobs) if (a !== b) expect(Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2])).toBeGreaterThanOrEqual(20);
  });

  it("put packs together, sharing a pack id", () => {
    const spawnArea = { id: "spwn0001", spawns: [{ creature: "wolf0001", density: 9, levels: 4, respawn: 60, pack: [3, 3], wander: 5 }] };
    const mobs = scatter(spawnArea, square(512), { standAt: () => 0, id: ids(), packId: () => "pack0001", random: seeded() });
    expect(mobs).toHaveLength(9);
    expect(mobs.every((m) => m.pack === "pack0001" && m.wander === 5)).toBe(true);
    const [first, second] = mobs;
    expect(Math.hypot(first.at[0] - second.at[0], first.at[2] - second.at[2])).toBeLessThanOrEqual(8.1);
  });

  it("put none where there's nowhere to stand", () => {
    const spawnArea = { id: "spwn0001", spawns: [{ creature: "gobl0001", density: 4 }] };
    expect(scatter(spawnArea, square(512), { standAt: () => null, id: ids(), packId: ids(), random: seeded() })).toEqual([]);
  });
});
