import { describe, expect, it } from "vitest";
import { allStone } from "../v2/caves.js";
import { Caves } from "./caves.js";
import { faceAt, flatten, reshape, smooth } from "./cavePolish.js";
import { caveBlocks } from "./caveMesh.js";

const span = (floor, ceiling, net = "n") => ({ floor, ceiling, stone: allStone(0), net });

describe("cave polish", () => {
  it("flattens floors to a level, or ceilings, keeping a voxel of air", () => {
    expect(flatten([span(-62, -50)], -64, -56, "n", -60, true)).toEqual([span(-60, -50)]);
    expect(flatten([span(-58, -50)], -64, -56, "n", -60, true)).toEqual([span(-60, -50)]);
    expect(flatten([span(-58, -50)], -52, -48, "n", -54, false)).toEqual([span(-58, -54)]);
    // Another network's, and one that would close, are left.
    expect(flatten([span(-62, -50, "m")], -64, -56, "n", -60, true)).toEqual([span(-62, -50, "m")]);
    expect(flatten([span(-62, -58)], -64, -56, "n", -58, true)).toEqual([span(-62, -58)]);
  });

  it("smooths a floor toward those beside it", () => {
    const beside = () => [[span(-60, -50)], [span(-60, -50)], [span(-60, -50)], []];
    expect(smooth([span(-56, -50)], -64, -40, "n", beside)).toEqual([span(-60, -50)]);
    expect(smooth([span(-56, -50)], -64, -40, "n", () => [[], [], [], []])).toEqual([span(-56, -50)]);
  });

  it("paints the spans a shape covers, and undoes by restoring", () => {
    const caves = new Caves({ add() {} }, { heightAt: () => 0, cellHeightAt: () => 0 });
    caves.dig({ kind: "box", at: [10, -50, 10], half: [6, 6, 6], yaw: 0 }, { net: "n" });
    const was = structuredClone([...caves.tiles]);
    const red = allStone(2);
    const before = caves.edit((columnsOf) => reshape({ kind: "cylinder", at: [10, -50, 10], radius: 3, half: [3, 3, 3] }, columnsOf, (spans) => spans.map((s) => ({ ...s, stone: red }))));
    expect(caves.spans(5, 5)[0].stone).toEqual(red);
    expect(caves.spans(2, 2)[0].stone).not.toEqual(red);
    caves.restore(before);
    expect([...caves.tiles]).toEqual(was);
  });
});

describe("blocks", () => {
  it("aims at the face a ray meets, even glancing along the grid", () => {
    // Looking down and a little along x onto the floor at y 10, in voxel 5's column.
    expect(faceAt([10.9, 10, 4.2], [0.1, -0.99, 0])).toEqual({ rock: [5, 4, 2], out: [0, 1, 0] });
    // Looking along +x at a wall at x 12, the hit close to a voxel's corner.
    expect(faceAt([12, 9.95, 4.05], [0.99, -0.1, 0.1])).toEqual({ rock: [6, 4, 2], out: [-1, 0, 0] });
  });

  it("outlines every block", () => {
    const caves = new Caves({ add() {} }, { heightAt: () => 50, cellHeightAt: () => 50 });
    // A box 8 ft long, 4 wide and high: 4 by 2 by 2 voxels.
    caves.dig({ kind: "box", at: [124, 14, 124], half: [4, 2, 2], yaw: 0 });
    const { edges } = caveBlocks(0, 0, caves.world);
    // Each face of the box has a square of edges round each of its blocks' faces, give or take
    // those shared: floor and ceiling 4 by 2, the long sides 4 by 2, the ends 2 by 2.
    const faces = 2 * 8 + 2 * 8 + 2 * 4;
    expect(edges.length / 6).toBeGreaterThan(faces * 2);
    for (let n = 1; n < edges.length; n += 3) expect(edges[n]).toBeGreaterThan(11.9);
  });
});
