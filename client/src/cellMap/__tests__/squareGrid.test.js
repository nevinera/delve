import {describe, it, expect} from "vitest";
import * as sq from "../squareGrid";
import {gridOf, mapSizeOf} from "../grid";
import {buildDungeonScene} from "../dungeon";
import {STYLES} from "../style";
import {autoBarriers} from "../../mapEditor/cells/autoBarriers";

const dungeon = (cells) => ({version: 1, theme: "dungeon", seed: 2, grid: {type: "square", cols: cells[0].length, rows: cells.length}, cells});

describe("squareGrid", () => {
  it("sizes maps in 5 foot cells", () => {
    expect(mapSizeOf({type: "square", cols: 6, rows: 4})).toEqual({width: 30, height: 20});
  });

  it("finds cells from points and back", () => {
    for (const [c, r] of [[0, 0], [3, 2], [5, 7]]) {
      const {x, y} = sq.cellCenter(c, r, 5);
      expect(sq.cellAt(x, y, 5)).toEqual([c, r]);
      expect(sq.pointAt(x, y, 5)).toEqual([c, r]);
    }
  });

  it("counts diagonals as one step", () => {
    expect(sq.squareDistance([0, 0], [3, 2])).toBe(3);
  });

  it("draws lines along rows and columns only", () => {
    expect(sq.squareLine([1, 1], [1, 3])).toEqual([[1, 1], [1, 2], [1, 3]]);
    expect(sq.squareLine([1, 1], [2, 2])).toBeNull();
    expect(sq.squareRays([2, 2], 2)).toHaveLength(8);
  });

  it("puts neighbors across the edge they share", () => {
    const g = gridOf("square");
    expect(g.edges).toBe(4);
    for (let edge = 0; edge < 4; edge++) {
      const [c, r] = g.neighbor(3, 3, edge);
      const back = g.neighbor(c, r, (edge + 2) % 4);
      expect(back).toEqual([3, 3]);
    }
  });

  it("rejects unknown grid types", () => {
    expect(() => gridOf("tri")).toThrow(/unknown grid type/);
  });
});

describe("dungeon scene", () => {
  const map = dungeon(["TTTTT", "T.%.T", "T.~wT", "TTTTT"]);

  it("sorts floor, rubble, puddles and water", () => {
    const scene = buildDungeonScene(map);
    expect(scene.cells.meadow.length).toBe(3);
    expect(scene.walls.length).toBeGreaterThan(0);
    expect(scene.width).toBe(25);
  });

  it("is repeatable for a seed", () => {
    expect(buildDungeonScene(map).stones).toEqual(buildDungeonScene(map).stones);
  });
});

describe("ruins and mansion scenes", () => {
  const cells = ["TTTTTTT", "T.....T", "T.%.~wT", "TTTTTTT"];
  const withTheme = (theme) => ({...dungeon(cells), theme});

  it("lays planks and no hatching in a mansion", () => {
    const scene = buildDungeonScene(withTheme("mansion"), STYLES.mansion.dungeon);
    expect(scene.planks.length).toBeGreaterThan(0);
    expect(scene.hatches).toEqual([]);
    expect(scene.stones).toEqual([]);
    expect(scene.puddles).toEqual([]);
  });

  it("keeps flagstones and grows moss in ruins", () => {
    const scene = buildDungeonScene({...withTheme("ruins"), seed: 5}, {moss: 1});
    expect(scene.planks).toEqual([]);
    expect(scene.moss.length).toBeGreaterThan(0);
    expect(scene.hatches.length).toBeGreaterThan(0);
  });

  it("styles both with the dungeon renderer", () => {
    expect(STYLES.ruins.renderer).toBe("dungeon");
    expect(STYLES.mansion.renderer).toBe("dungeon");
  });
});

describe("autoBarriers on a square grid", () => {
  it("walls the rock with straight segments on the cell edges", () => {
    const result = autoBarriers(dungeon(["TTTTT", "T...T", "T...T", "TTTTT"]));
    expect(result.barriers.length).toBeGreaterThan(0);
    for (const barrier of result.barriers) {
      for (const {x, y} of barrier.locations) {
        expect(x % 5).toBe(0);
        expect(y % 5).toBe(0);
      }
    }
  });
});
