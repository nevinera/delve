import { describe, expect, it } from "vitest";
import { strFromU8, strToU8 } from "fflate";
import { moveRestAreas, readAreas, regionsPath } from "./regions.js";

const json = (files, path) => JSON.parse(strFromU8(files.get(path)));
const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("regions", () => {
  it("reads areas, leaving out ones that aren't whole", () => {
    expect(readAreas({ areas: [{ id: "area0001", points: square }, { id: "area0002", points: [[0, 0], [1, 1]] }, { points: square }] })).toEqual([{ id: "area0001", points: square }]);
    expect(readAreas(null)).toEqual([]);
  });

  it("moves rest points' polygons into their continents' areas", () => {
    const world = { version: 2, restPoints: [
      { id: "rest0001", continent: "main", at: [5, 5], area: square },
      { id: "rest0002", continent: "isle", at: [5, 5], area: square },
      { id: "rest0003", continent: "main", at: [5, 5] },
      { id: "rest0004", continent: "main", at: [5, 5], area: "area0009" },
      { id: "rest0005", continent: "main", at: [5, 5], area: [[0, 0]] },
    ] };
    const files = new Map([
      ["world.json", strToU8(JSON.stringify(world))],
      [regionsPath("main"), strToU8(JSON.stringify({ version: 1, areas: [{ id: "area0009", points: square }] }))],
    ]);
    expect(moveRestAreas(files)).toBe(2);
    const rests = json(files, "world.json").restPoints;
    const main = json(files, regionsPath("main")).areas;
    expect(main).toHaveLength(2);
    expect(main[1]).toEqual({ id: rests[0].area, points: square });
    expect(json(files, regionsPath("isle")).areas).toEqual([{ id: rests[1].area, points: square }]);
    expect(rests[0].area).toMatch(/^area[0-9a-z]{4}$/);
    expect(rests[2]).not.toHaveProperty("area");
    expect(rests[3].area).toBe("area0009");
    expect(rests[4]).not.toHaveProperty("area");
    expect(moveRestAreas(files)).toBe(0);
  });
});
