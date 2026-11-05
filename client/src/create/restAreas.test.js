import { describe, expect, it } from "vitest";
import { areasOf, giveAreas, ownerOf } from "./restAreas.js";

const square = (x, z, r) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];

describe("resting areas", () => {
  const rests = () => [
    { id: "resta", continent: "main", at: [0, 0] },
    { id: "restb", continent: "main", at: [100, 0] },
    { id: "restc", continent: "far", at: [0, 0], area: square(0, 0, 5) },
  ];

  it("go to the rest point inside them, or else the nearest", () => {
    const here = rests().slice(0, 2);
    expect(ownerOf(square(100, 0, 10), here).id).toBe("restb");
    expect(ownerOf(square(30, 0, 5), here).id).toBe("resta");
    expect(ownerOf(square(0, 0, 5), [])).toBe(null);
  });

  it("go back on the rest points, leaving other continents' be", () => {
    const list = rests();
    list[1].area = square(100, 0, 1);
    giveAreas(list, { areas: [{ rest: "resta", points: square(0, 0, 10) }, { rest: "gone", points: square(5, 5, 1) }] }, "main");
    expect(list[0].area).toEqual(square(0, 0, 10));
    expect(list[1].area).toBeUndefined();
    expect(list[2].area).toEqual(square(0, 0, 5));
    expect(areasOf(list, "main").areas).toEqual([{ kind: "resting", rest: "resta", points: square(0, 0, 10) }]);
  });
});
