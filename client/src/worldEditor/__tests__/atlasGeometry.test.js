import {describe, it, expect} from "vitest";
import {atlasProblems, polygonsOverlap, rectCorners, rectInside, rectsOverlap, signedArea, simplePolygon, triangles} from "../atlasGeometry";

const sq = (x, y, s) => ({x, y, width: s, height: s});
const quad = (r) => rectCorners(r);
const pts = (list) => list.map(([x, y]) => ({x, y}));
const concave = pts([[0, 0], [4, 0], [1, 1], [0, 4]]);
// An L: a 4x4 square missing its north-east 2x2.
const ell = pts([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]);

describe("atlasGeometry (as app/services/atlas_geometry.rb)", () => {
  it("knows simple polygons", () => {
    expect(simplePolygon(pts([[0, 0], [1, 0], [1, 1]]))).toBe(true);
    expect(simplePolygon(quad(sq(0, 0, 2)))).toBe(true);
    expect(simplePolygon(concave)).toBe(true);
    expect(simplePolygon(ell)).toBe(true);
    expect(simplePolygon(pts([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]]))).toBe(true);
    expect(simplePolygon(pts([[0, 0], [2, 2], [2, 0], [0, 2]]))).toBe(false);
    expect(simplePolygon(pts([[0, 0], [1, 0], [2, 0], [3, 0]]))).toBe(false);
    expect(simplePolygon(pts([[0, 0], [2, 0], [2, 0], [2, 2], [0, 2]]))).toBe(false);
    expect(simplePolygon(pts([[0, 0], [2, 0], [1, 0], [1, 2]]))).toBe(false);
    expect(simplePolygon(pts([[0, 0], [4, 0], [4, 4], [2, 0], [0, 4]]))).toBe(false);
  });

  it("triangulates a concave polygon, either way round", () => {
    for (const polygon of [ell, [...ell].reverse()]) {
      expect(triangles(polygon).reduce((sum, t) => sum + Math.abs(signedArea(t)), 0)).toBeCloseTo(12, 9);
    }
  });

  it("knows a rect inside a quad", () => {
    expect(rectInside(sq(0, 0, 2), quad(sq(0, 0, 2)))).toBe(true);
    expect(rectInside(sq(1, 1, 2), quad(sq(0, 0, 2)))).toBe(false);
    expect(rectInside(sq(0.1, 0.1, 1.5), concave)).toBe(false);
    expect(rectInside(sq(0.1, 0.1, 0.5), concave)).toBe(true);
    expect(rectInside(sq(0, 0, 2), ell)).toBe(true);
    expect(rectInside(sq(1, 1, 2), ell)).toBe(false);
  });

  it("counts overlap, not touching", () => {
    expect(rectsOverlap(sq(0, 0, 2), sq(1, 1, 2))).toBe(true);
    expect(rectsOverlap(sq(0, 0, 2), sq(2, 0, 2))).toBe(false);
    expect(polygonsOverlap(quad(sq(0, 0, 2)), quad(sq(0, 0, 2)))).toBe(true);
    expect(polygonsOverlap(quad({x: 0, y: 0, width: 2, height: 1}), quad({x: 1, y: 0, width: 2, height: 1}))).toBe(true);
    expect(polygonsOverlap(quad(sq(0, 0, 2)), quad(sq(2, 2, 2)))).toBe(false);
    expect(polygonsOverlap(concave, quad(sq(2, 2, 1)))).toBe(false);
    expect(polygonsOverlap(ell, quad(sq(2, 2, 2)))).toBe(false);
    expect(polygonsOverlap(ell, quad(sq(1, 1, 2)))).toBe(true);
  });

  it("lists an atlas's problems", () => {
    const sizes = {a: {m1: {width: 10, height: 10}, m2: {width: 10, height: 10}}, b: {m3: {width: 10, height: 10}}};
    const atlas = {zones: {
      a: {outline: quad(sq(0, 0, 20)), maps: {m1: {x: 0, y: 0}, m2: {x: 5, y: 5}}},
      b: {outline: quad(sq(15, 0, 20)), maps: {m3: {x: 30, y: 0}}},
    }};
    expect(atlasProblems(atlas, sizes)).toEqual([
      'map "b/m3" isn\'t inside its zone\'s outline',
      'map "a/m2" overlaps "a/m1"',
      'zone "b"\'s outline overlaps "a"\'s',
    ]);
  });
});
