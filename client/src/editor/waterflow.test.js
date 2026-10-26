import { describe, it, expect } from "vitest";
import { outline, simulateFlow } from "./waterflow.js";
import { TILE_FT } from "../world/constants.js";

const ft = (tiles) => tiles * TILE_FT;
const dry = () => false;
const sea = (x) => x < ft(-2); // everything west of x = -2 tiles
const last = (points) => points[points.length - 1];

describe("water flow", () => {
  it("runs straight down a slope into the sea", () => {
    const { rivers, pools, end } = simulateFlow({ source: [3, 0], width: 12, heightAt: (x) => x / 10, isWater: sea });
    expect(end).toBe("water");
    expect(pools).toEqual([]);
    expect(rivers).toHaveLength(1);
    expect(rivers[0][0]).toEqual([3, 0]);
    expect(last(rivers[0])[0]).toBeLessThan(-2);
    expect(rivers[0].every(([, z]) => z === 0)).toBe(true);
  });

  it("follows the steepest way down", () => {
    const east = simulateFlow({ source: [0, 0], width: 12, heightAt: (x, z) => -x / 10 - z / 100, isWater: (x) => x > ft(3) });
    expect(last(east.rivers[0])[1]).toBe(0);
    const southeast = simulateFlow({ source: [0, 0], width: 12, heightAt: (x, z) => -x / 10 - z / 10, isWater: (x) => x > ft(3) });
    const [x, z] = last(southeast.rivers[0]);
    expect(x).toBeGreaterThan(3);
    expect(z).toBeCloseTo(x, 1);
  });

  it("fills a hollow, spills over its lowest rim and carries on", () => {
    // A bowl round the origin, 20ft deep, with its rim lowest to the west, then a slope down to
    // the sea further west.
    const bowl = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 200) return 100 + (r / 200) * 20 - (x < 0 ? (-x / 200) * 5 : 0);
      return 115 + (x > -200 ? 20 : -(-x - 200) / 10);
    };
    const { rivers, pools, end } = simulateFlow({ source: [0.1, 0.1], width: 30, heightAt: bowl, isWater: sea });
    expect(end).toBe("water");
    expect(pools).toHaveLength(1);
    expect(pools[0].level).toBeGreaterThan(110);
    expect(pools[0].level).toBeLessThan(121);
    expect(rivers.length).toBeGreaterThanOrEqual(1);
    expect(last(last(rivers))[0]).toBeLessThan(-2);
  });

  it("stops in a pool when the hollow is too big for its flow", () => {
    const basin = (x, z) => Math.hypot(x, z) / 10;
    const small = simulateFlow({ source: [1, 0], width: 4, heightAt: basin, isWater: dry });
    const big = simulateFlow({ source: [1, 0], width: 40, heightAt: basin, isWater: dry });
    expect(small.end).toBe("pool");
    expect(big.end).toBe("pool");
    const across = ({ pools }) => Math.max(...pools[0].region[0][0].map(([x]) => x)) - Math.min(...pools[0].region[0][0].map(([x]) => x));
    expect(across(small) * TILE_FT).toBeLessThan(4 * 40 * 1.2);
    expect(across(big)).toBeGreaterThan(across(small) * 5);
    expect(big.pools[0].level).toBeGreaterThan(small.pools[0].level);
  });

  it("stops where it reaches water already there", () => {
    const pond = (x, z) => Math.hypot(x - ft(2), z) < 100;
    const { rivers, pools, end } = simulateFlow({ source: [4, 0], width: 12, heightAt: (x) => x / 10, isWater: pond });
    expect(end).toBe("water");
    expect(pools).toEqual([]);
    expect(last(rivers[0])[0]).toBeGreaterThan(1.7);
  });
});

describe("pool outlines", () => {
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
