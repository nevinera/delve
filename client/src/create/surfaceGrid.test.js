import { describe, expect, it } from "vitest";
import { planeRun, runLines, runPoint, snapInRun } from "./surfaceGrid.js";

const wall = (x, length) => ({ at: [x, 0, 0], turn: [0, -90, 0], outline: [[0, 0], [length, 0], [length, 10], [0, 10]], thickness: 1, surface: "stone" });

describe("planeRun", () => {
  it("finds the pieces of a wall in one plane, joined end to end", () => {
    const pieces = [wall(0, 8), wall(8, 8), wall(16, 6)];
    const apart = wall(40, 8); // in the plane, but not joined
    const across = { ...wall(8, 8), turn: [90, -90, 0] };
    const near = () => [...pieces, apart, across];
    const run = planeRun(pieces[1], near);
    expect(new Set(run.slabs)).toEqual(new Set(pieces));
    run.box.forEach((v, i) => expect(v).toBeCloseTo([-8, 0, 14, 10][i]));
  });
});

describe("runLines", () => {
  it("centers the lines on the run, every fourth a major one", () => {
    const { us, vs } = runLines([0, 0, 22, 10], 2);
    expect(us.map((l) => l.at)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]);
    expect(us.filter((l) => l.major).map((l) => l.at)).toEqual([3, 11, 19]);
    expect(vs.map((l) => l.at)).toEqual([1, 3, 5, 7, 9]);
  });
});

describe("snapInRun", () => {
  it("moves a point to the nearest crossing", () => {
    expect(snapInRun([0, 0, 22, 10], [11.6, 2.2], 2)).toEqual([11, 3]);
  });

  it("puts run points back in the world", () => {
    const run = planeRun(wall(0, 8), () => []);
    runPoint(run, [4, 0, 5]).forEach((v, i) => expect(v).toBeCloseTo([4, 5, 0][i]));
  });
});
