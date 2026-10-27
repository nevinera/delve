import { describe, expect, it } from "vitest";
import { runBones, polygonDistance } from "./bones.js";

const square = [[0, 0], [8000, 0], [8000, 8000], [0, 8000]];
const island = (ops = []) => ({ bones: 1, seed: 3, ops: [{ op: "land", outline: square, height: 100, inland: 1000, shelf: 800 }, ...ops] });

describe("bones", () => {
  it("raises land inside an outline, with sea outside", () => {
    const land = runBones(island());
    expect(land.heightAt(4000, 4000)).toBeCloseTo(100);
    expect(land.heightAt(-2000, 4000)).toBe(-50);
    expect(Math.abs(land.heightAt(0, 4000))).toBeLessThan(5);
  });

  it("gives the same land from the same file, and different land from another seed", () => {
    const bones = island([{ op: "noise", height: 50, wavelength: 1000 }, { op: "erode", by: "water", drops: 1 }]);
    expect(runBones(bones).hash()).toBe(runBones(bones).hash());
    expect(runBones({ ...bones, seed: 4 }).hash()).not.toBe(runBones(bones).hash());
  });

  it("builds ridges up, cuts valleys down, and sinks craters to their floor", () => {
    const land = runBones(
      island([
        { op: "ridge", path: [[2000, 2000], [6000, 2000]], height: 800, width: 900, jag: 0, vary: 0, wander: 0 },
        { op: "valley", path: [[2000, 6000], [6000, 6000]], depth: 60, width: 500, wander: 0 },
        { op: "crater", at: [4000, 4000], radius: 800, floor: 20, rough: 0, apron: 300 },
      ]),
    );
    expect(land.heightAt(4000, 2000)).toBeGreaterThan(800);
    expect(land.heightAt(4000, 6000)).toBeCloseTo(40, -1);
    expect(land.heightAt(4000, 4000)).toBeCloseTo(20);
    expect(land.heightAt(4000, 4000 - 800)).toBeGreaterThan(250);
  });

  it("keeps area ops to their outline and their heights", () => {
    const lift = (above) => runBones(island([{ op: "lift", at: [2000, 2000], radius: 1000, feather: 10, height: 300, above }]));
    expect(lift(-100).heightAt(2000, 2000)).toBeCloseTo(400);
    expect(lift(-100).heightAt(6000, 6000)).toBeCloseTo(100);
    expect(lift(150).heightAt(2000, 2000)).toBeCloseTo(100);
  });

  it("says which op is wrong, and how", () => {
    expect(() => runBones({ bones: 1, ops: [{ op: "mountain" }] })).toThrow(/op 1 \(mountain\): there's no such op/);
    expect(() => runBones(island([{ op: "ridge", path: [[0, 0], [1, 1]] }]))).toThrow(/op 2 \(ridge\): needs height, width/);
    expect(() => runBones(island([{ op: "lift", height: 5, hieght: 6 }]))).toThrow(/doesn't take hieght/);
  });

  it("measures distance to an outline, negative inside", () => {
    expect(polygonDistance(square, 4000, 1000)).toBe(-1000);
    expect(polygonDistance(square, 9000, 4000)).toBe(1000);
  });
});
