import { describe, expect, it } from "vitest";
import { CELLS, CHUNKS, SHAPES, TILES, levelFor, noiseBrush, pullBrush, raiseBrush } from "./geo.js";

describe("raise brush", () => {
  it("has shapes that are 1 at the middle and 0 at the edge, but the cylinder's hard edge", () => {
    for (const [name, shape] of Object.entries(SHAPES)) {
      expect(shape(0, 0)).toBeCloseTo(1);
      expect(shape(1, 1)).toBeCloseTo(name === "cylinder" ? 1 : 0);
    }
  });

  it("holds the mesa flat, drops it fast, then eases it out", () => {
    expect(SHAPES.mesa(0.7)).toBe(1);
    expect(SHAPES.mesa(0.8)).toBeCloseTo(0.2);
    expect(SHAPES.mesa(0.9)).toBeCloseTo(0.05);
  });

  it("raises half the round brush, on the side its angle points to", () => {
    const settings = { shape: "half", radius: 100, strength: 1, noise: 0, angle: Math.PI / 2 };
    const { at } = raiseBrush(settings, 0, 0, 1);
    expect(at(0, 30)).toBeCloseTo(100 * SHAPES.round(0.3));
    expect(at(0, -30)).toBe(0);
    expect(at(30, 0)).toBeCloseTo(100 * SHAPES.round(0.3));
  });

  it("holds the steep shape up longer than the round one, and the peak lower", () => {
    expect(SHAPES.steep(0.6)).toBeGreaterThan(SHAPES.round(0.6));
    expect(SHAPES.peak(0.3)).toBeLessThan(SHAPES.round(0.3));
  });

  it("moves the middle by strength times radius a second, and nothing past the edge", () => {
    const settings = { shape: "round", radius: 100, strength: 0.2, noise: 0 };
    const { at, bounds } = raiseBrush(settings, 50, 50, 0.5);
    expect(at(50, 50)).toBeCloseTo(10);
    expect(at(151, 50)).toBe(0);
    expect(bounds).toEqual([-50, -50, 150, 150]);
    expect(raiseBrush({ ...settings, lower: true }, 50, 50, 0.5).at(50, 50)).toBeCloseTo(-10);
  });

  it("puts lumps in with noise, the same at the same place", () => {
    const settings = { shape: "steep", radius: 400, strength: 0.2, noise: 0.9 };
    const a = raiseBrush(settings, 0, 0, 1).at;
    const b = raiseBrush(settings, 0, 0, 1).at;
    const values = [0, 40, 80, 120].map((x) => a(x, 10));
    expect(values).toEqual([0, 40, 80, 120].map((x) => b(x, 10)));
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(1);
  });

  it("works coarser the bigger it is", () => {
    expect(levelFor(64)).toBe(CELLS);
    expect(levelFor(1000)).toBe(CHUNKS);
    expect(levelFor(6000)).toBe(TILES);
  });
});

describe("flatten and smooth", () => {
  const brush = { radius: 100, strength: 0.2 };

  it("flattens toward the height the stroke began at, most at the middle", () => {
    const { at } = pullBrush("flatten", brush, 0, 0, 0.5, (x) => x, 0);
    expect(at(0, 0)).toBe(0);
    expect(at(20, 0)).toBeCloseTo(-20 * 0.5 * SHAPES.round(0.2));
    expect(at(200, 0)).toBe(0);
  });

  it("smooths a point toward the ground round it, the same each time it's asked", () => {
    // An eighth of 100 ft, in 4 ft cells: 12 ft away.
    const spike = (x, z) => (x === 0 && z === 0 ? 40 : 0);
    const { at } = pullBrush("smooth", brush, 0, 0, 0.1, spike);
    expect(at(0, 0)).toBeCloseTo(-40 * 0.3);
    expect(at(0, 0)).toBe(at(0, 0));
    expect(at(12, 0)).toBeCloseTo(10 * 0.3 * SHAPES.round(0.12));
  });
});

describe("noise brush", () => {
  const settings = { radius: 100, strength: 0.5, grain: 20, craggy: false, lower: false };

  it("moves the ground up and down, about evenly, and nothing past the edge", () => {
    const { at, level } = noiseBrush(settings, 0, 0, 1);
    const moves = [];
    for (let x = -60; x <= 60; x += 4) for (let z = -60; z <= 60; z += 4) moves.push(at(x, z));
    expect(Math.max(...moves)).toBeGreaterThan(0.5);
    expect(Math.min(...moves)).toBeLessThan(-0.5);
    expect(Math.abs(moves.reduce((a, b) => a + b) / moves.length)).toBeLessThan(2);
    expect(at(101, 0)).toBe(0);
    expect(level).toBe(CELLS);
  });

  it("makes the same lumps each time, and takes them out going the other way", () => {
    const [a, b] = [noiseBrush(settings, 0, 0, 1), noiseBrush({ ...settings, lower: true }, 0, 0, 1)];
    expect(a.at(13, 7)).toBe(noiseBrush(settings, 0, 0, 1).at(13, 7));
    expect(a.at(13, 7) + b.at(13, 7)).toBeCloseTo(0);
  });

  it("grows lumps as fast as strength times grain a second", () => {
    const { at } = noiseBrush(settings, 0, 0, 1);
    let most = 0;
    for (let x = -20; x <= 20; x += 1) most = Math.max(most, Math.abs(at(x, 0)));
    expect(most).toBeLessThanOrEqual(settings.strength * settings.grain);
  });

  it("works coarser for big brushes, with their grain no finer than that", () => {
    const big = noiseBrush({ ...settings, radius: 1000 }, 0, 0, 1);
    expect(big.level).toBe(CHUNKS);
    const craggy = noiseBrush({ ...settings, craggy: true }, 0, 0, 1);
    expect(craggy.at(5, 5)).not.toBe(noiseBrush(settings, 0, 0, 1).at(5, 5));
  });
});
