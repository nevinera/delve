import { describe, it, expect } from "vitest";
import { simulateWater } from "./waterflow.js";
import { TILE_FT } from "../world/constants.js";

const ft = (tiles) => tiles * TILE_FT;
const dry = () => false;
const sea = (x) => x < ft(-2); // everything west of x = -2 tiles
const last = (points) => points[points.length - 1];
// Water from sources given as [x, z] or { at, width }, 12ft wide unless said, with ids s0, s1, ...
const simulate = (sources, heightAt, isWater) =>
  simulateWater({ sources: sources.map((s, i) => ({ id: `s${i}`, width: 12, ...(Array.isArray(s) ? { at: s } : s) })), heightAt, isWater });

describe("water flow", () => {
  it("runs straight down a slope into the sea", () => {
    const { rivers, pools, ends } = simulate([[3, 0]], (x) => x / 10, sea);
    expect(ends).toEqual({ s0: "water" });
    expect(pools).toEqual([]);
    expect(rivers).toHaveLength(1);
    expect(rivers[0].width).toBe(12);
    expect(rivers[0].points[0]).toEqual([3, 0]);
    expect(last(rivers[0].points)[0]).toBeLessThan(-2);
    expect(rivers[0].points.every(([, z]) => z === 0)).toBe(true);
  });

  it("follows the steepest way down", () => {
    const east = simulate([[0, 0]], (x, z) => -x / 10 - z / 100, (x) => x > ft(3));
    expect(last(east.rivers[0].points)[1]).toBe(0);
    const southeast = simulate([[0, 0]], (x, z) => -x / 10 - z / 10, (x) => x > ft(3));
    const [x, z] = last(southeast.rivers[0].points);
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
    const { rivers, pools, ends } = simulate([{ at: [0.1, 0.1], width: 30 }], bowl, sea);
    expect(ends.s0).toBe("water");
    expect(pools).toHaveLength(1);
    expect(pools[0].level).toBeGreaterThan(110);
    expect(pools[0].level).toBeLessThan(121);
    expect(last(last(rivers).points)[0]).toBeLessThan(-2);
  });

  it("stops in a pool when the hollow is too big for its flow", () => {
    const basin = (x, z) => Math.hypot(x, z) / 10;
    const small = simulate([{ at: [1, 0], width: 4 }], basin, dry);
    const big = simulate([{ at: [1, 0], width: 40 }], basin, dry);
    expect(small.ends.s0).toBe("pool");
    expect(big.ends.s0).toBe("pool");
    const across = ({ pools }) => Math.max(...pools[0].region[0][0].map(([x]) => x)) - Math.min(...pools[0].region[0][0].map(([x]) => x));
    expect(across(small) * TILE_FT).toBeLessThan(4 * 40 * 1.2);
    expect(across(big)).toBeGreaterThan(across(small) * 5);
    expect(big.pools[0].level).toBeGreaterThan(small.pools[0].level);
  });

  it("stops where it reaches water already there", () => {
    const pond = (x, z) => Math.hypot(x - ft(2), z) < 100;
    const { rivers, pools, ends } = simulate([[4, 0]], (x) => x / 10, pond);
    expect(ends.s0).toBe("water");
    expect(pools).toEqual([]);
    expect(last(rivers[0].points)[0]).toBeGreaterThan(1.7);
  });
});

describe("joined rivers", () => {
  // A valley along z = 0, falling west to the sea.
  const valley = (x, z) => Math.abs(z) / 5 + x / 10;

  it("widen where they meet, as the root of their flows added up", () => {
    const { rivers, ends } = simulate([[4, 1], [6, -1]], valley, sea);
    expect(ends).toEqual({ s0: "water", s1: "water" });
    const joined = rivers.find((r) => last(r.points)[0] < -2);
    expect(joined.width).toBeCloseTo(Math.hypot(12, 12), 1);
    expect(rivers.filter((r) => r.width === 12)).toHaveLength(2);
  });

  it("meet end to end, so the main river runs on unbroken", () => {
    const { rivers } = simulate([[4, 1], [6, -1]], valley, sea);
    const joined = rivers.find((r) => r.width > 12);
    for (const r of rivers.filter((r) => r !== joined)) {
      const end = last(r.points);
      expect(rivers.some((o) => o !== r && (o.points[0].join() === end.join() || last(o.points).join() === end.join()))).toBe(true);
    }
  });

  it("can fill a pool that one alone couldn't, so it spills and flows on", () => {
    // A bowl 600ft across, rim lowest to the west, then down to the sea. One 12ft stream fills
    // up to about 480ft across; two together, about 680ft.
    const bowl = (x, z) => {
      const r = Math.hypot(x, z);
      if (r < 300) return 100 + r / 10 - (x < 0 ? (-x / 300) * 5 : 0);
      return 130 + (x > -300 ? 20 : -(-x - 300) / 10);
    };
    const shore = (x) => x < -1500;
    expect(simulate([[0.1, 0.1]], bowl, shore).ends).toEqual({ s0: "pool" });
    const both = simulate([[0.1, 0.1], [-0.1, -0.1]], bowl, shore);
    expect(both.ends).toEqual({ s0: "water", s1: "water" });
    expect(both.pools).toHaveLength(1);
  });
});

describe("river courses", () => {
  it("meander on flat ground but not down steep slopes", () => {
    const wander = (heightAt) => {
      const { points } = simulate([[8, 0]], heightAt, sea).rivers[0];
      return Math.max(...points.map(([, z]) => Math.abs(z))) * TILE_FT;
    };
    expect(wander((x) => x / 10)).toBe(0);
    expect(wander((x, z) => x / 1000 + Math.abs(z) / 1000)).toBeGreaterThan(10);
  });

  it("round off the lattice's corners", () => {
    const { points } = simulate([[0, 0]], (x, z) => -x / 10 - Math.abs(z - ft(1)) / 10, (x) => x > ft(4)).rivers[0];
    const turns = points.slice(1, -1).map((p, k) => {
      const [a, b] = [points[k], points[k + 2]];
      const [u, v] = [[p[0] - a[0], p[1] - a[1]], [b[0] - p[0], b[1] - p[1]]];
      return Math.acos(Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))));
    });
    expect(Math.max(...turns)).toBeLessThan(Math.PI / 6);
  });
});
