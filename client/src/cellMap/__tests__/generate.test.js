import {describe, it, expect} from "vitest";
import {generateCellMap, TAGS} from "../generate";
import {validateCellMap} from "../format";
import {exitCells, exitEdge} from "../exits";
import {CELL_SIZE, cellPoint, neighbor} from "../hexGrid";

const GROUNDS = ".%~";
const open = (map, c, r) => GROUNDS.includes(map.cells[r]?.[c] ?? "T");

// The open cells, in groups that join up.
function groups(map) {
  const seen = new Set();
  const out = [];
  map.cells.forEach((line, r) => [...line].forEach((ch, c) => {
    if (!GROUNDS.includes(ch) || seen.has(`${c},${r}`)) return;
    const group = [[c, r]];
    seen.add(`${c},${r}`);
    for (let i = 0; i < group.length; i++) {
      for (let e = 0; e < 6; e++) {
        const [nc, nr] = neighbor(...group[i], e);
        if (open(map, nc, nr) && !seen.has(`${nc},${nr}`)) {
          seen.add(`${nc},${nr}`);
          group.push([nc, nr]);
        }
      }
    }
    out.push(group);
  }));
  return out;
}

describe("generateCellMap", () => {
  const options = {cols: 40, rows: 30, seed: 7, connections: 3};

  it("makes the same valid map for the same options", () => {
    const map = generateCellMap(options);
    expect(validateCellMap(map)).toEqual([]);
    expect(generateCellMap(options)).toEqual(map);
    expect(generateCellMap({...options, seed: 8}).cells).not.toEqual(map.cells);
  });

  it("joins all its open ground, which only reaches the edge at its exits, each on its own side", () => {
    for (const tags of [[], ...TAGS.map((t) => [t]), ["burrow", "coral", "tight", "tree"]]) {
      for (const seed of [1, 2, 3]) {
        const map = generateCellMap({...options, seed, tags, connections: 4});
        expect(groups(map)).toHaveLength(1);
        expect(map.exits.map((e) => e.side).sort()).toEqual(["east", "north", "south", "west"]);
        const exitCellKeys = new Set(map.exits.flatMap((e) => exitCells(e, map.grid).map((cell) => cell.join(","))));
        for (const key of exitCellKeys) expect(open(map, ...key.split(",").map(Number))).toBe(true);
        map.cells.forEach((line, r) => [...line].forEach((ch, c) => {
          const edge = c === 0 || r === 0 || c === map.grid.cols - 1 || r === map.grid.rows - 1;
          if (edge && GROUNDS.includes(ch)) expect(exitCellKeys.has(`${c},${r}`)).toBe(true);
        }));
        const openCount = map.cells.join("").split("").filter((ch) => GROUNDS.includes(ch)).length;
        expect(openCount / (40 * 30)).toBeGreaterThan(0.15);
        expect(openCount / (40 * 30)).toBeLessThan(0.6);
      }
    }
  });

  it("leaves out exits when there are no connections, and starts from the theme's fill", () => {
    const map = generateCellMap({...options, connections: 0, theme: "cave"});
    expect(map).not.toHaveProperty("exits");
    expect(map.theme).toBe("cave");
    expect(map.cells.join("")).toMatch(/^[.%~T]+$/);
  });

  it("lays meadow mostly, with tall grass and marsh about, unless tags say otherwise", () => {
    const share = (tags) => {
      const all = [1, 2, 3, 4].flatMap((seed) => generateCellMap({...options, seed, tags}).cells.join("").split("")).filter((ch) => GROUNDS.includes(ch));
      return Object.fromEntries([...GROUNDS].map((ch) => [ch, all.filter((x) => x === ch).length / all.length]));
    };
    const plain = share([]);
    expect(plain["."]).toBeGreaterThan(0.5);
    expect(plain["%"]).toBeGreaterThan(0.02);
    expect(plain["~"]).toBeGreaterThan(0.02);
    expect(share(["dry"])["~"]).toBe(0);
    expect(share(["wet"])["~"]).toBeGreaterThan(0.5);
    expect(share(["rough"])["%"]).toBeGreaterThan(0.5);
    // Of tags that clash, the first wins.
    expect(share(["dry", "wet"])["~"]).toBe(0);
  });

  it("joins the exits with trails for paths, from the map's edge", () => {
    for (const connections of [1, 2, 3, 4]) {
      const map = generateCellMap({...options, connections, tags: ["paths"]});
      expect(validateCellMap(map)).toEqual([]);
      expect(map.trails).toHaveLength(Math.max(1, connections - 1));
      expect(map.trails.every((t) => t.type === "trail" && t.width === 0.8)).toBe(true);
      // Every exit has a trail starting at the edge in its stretch.
      for (const exit of map.exits) {
        const [a, b] = exitEdge(exit, map.grid);
        const ends = map.trails.flatMap((t) => [t.points[0], t.points[t.points.length - 1]]).map(([c, r]) => cellPoint(c, r, CELL_SIZE));
        expect(ends.some((p) => Math.hypot(p.x - (a.x + b.x) / 2, p.y - (a.y + b.y) / 2) < 0.2)).toBe(true);
      }
    }
    expect(generateCellMap({...options, connections: 0, tags: ["paths"]})).not.toHaveProperty("trails");
    expect(generateCellMap({...options, tags: ["paths"], theme: "cave"}).trails[0].type).toBe("worn");
  });

  it("refuses tags it doesn't know, and too many connections", () => {
    expect(() => generateCellMap({...options, tags: ["huge"]})).toThrow(/unknown tags: huge/);
    expect(() => generateCellMap({...options, connections: 5})).toThrow(/connections must be 0 to 4/);
  });
});
