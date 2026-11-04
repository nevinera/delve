import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { objectSolid, seesFeet, treeSolid } from "./sight.js";

const file = JSON.parse(readFileSync(new URL("../../../game-server/internal/worlds/testdata/sight.json", import.meta.url)));

describe("line of sight", () => {
  for (const c of file.cases) {
    it(c.name, () => {
      const feet = c.feet ?? 0;
      const rock = (x, y) => {
        const { ridge } = c;
        if (!ridge || Math.abs(x - ridge.x) > ridge.half || y >= ridge.top) return y < 0;
        return !ridge.air || y < ridge.air[0] || y > ridge.air[1];
      };
      const solids = (c.things ?? []).map((t) => (t.tree ? treeSolid({ x: t.x, z: t.z, kind: t.tree, size: t.size }, 0) : objectSolid(t, t.bottom)));
      const slabs = (c.slabs ?? []).map((name) => file[name]);
      expect(seesFeet(c.from ?? [0, feet, 0], c.to ?? [100, feet, 0], { rock, solids, slabs })).toBe(c.clear);
    });
  }
});
