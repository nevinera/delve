import { describe, expect, it } from "vitest";
import { CELLS, CHUNKS, SHAPES, TILES, levelFor, raiseBrush } from "./geo.js";

describe("raise brush", () => {
  it("has shapes that are 1 at the middle and 0 at the edge", () => {
    for (const shape of Object.values(SHAPES)) {
      expect(shape(0)).toBeCloseTo(1);
      expect(shape(1)).toBeCloseTo(0);
    }
  });

  it("holds the steep shape up longer than the round one, and the peak lower", () => {
    expect(SHAPES.steep(0.6)).toBeGreaterThan(SHAPES.round(0.6));
    expect(SHAPES.peak(0.3)).toBeLessThan(SHAPES.round(0.3));
  });

  it("moves the middle by strength times radius a second, and nothing past the edge", () => {
    const settings = { shape: "round", radius: 100, strength: 0.2, noise: false };
    const { at, bounds } = raiseBrush(settings, 50, 50, 0.5);
    expect(at(50, 50)).toBeCloseTo(10);
    expect(at(151, 50)).toBe(0);
    expect(bounds).toEqual([-50, -50, 150, 150]);
    expect(raiseBrush({ ...settings, lower: true }, 50, 50, 0.5).at(50, 50)).toBeCloseTo(-10);
  });

  it("puts lumps in with noise, the same at the same place", () => {
    const settings = { shape: "steep", radius: 400, strength: 0.2, noise: true };
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
