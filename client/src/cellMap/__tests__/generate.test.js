import {describe, it, expect} from "vitest";
import {generateCellMap, TAGS} from "../generate";
import {validateCellMap} from "../format";
import {exitCells, exitEdge} from "../exits";
import {CELL_SIZE, cellPoint, mapSize, neighbor} from "../hexGrid";
import {autoBarriers} from "../../mapEditor/cells/autoBarriers";
import {computeMapFill} from "../../game/mapFill";

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

  // 45 maps: over a second alone, and past vitest's 5s default under a full
  // parallel run.
  it("joins all its open ground, which only reaches the edge at its exits, each on its own side", {timeout: 30000}, () => {
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

  it("leaves no way through it a single cell wide", () => {
    for (const tags of [[], ["coral"], ["chaotic"], ["coral", "tight", "burrow"], ["chaotic", "hub"]]) {
      for (const seed of [1, 2, 3, 4]) {
        const map = generateCellMap({...options, seed, tags, connections: 4});
        const {cols, rows} = map.grid;
        map.cells.forEach((line, r) => [...line].forEach((ch, c) => {
          if (!GROUNDS.includes(ch) || c === 0 || r === 0 || c === cols - 1 || r === rows - 1) return;
          // Its open neighbors run unbroken around it, two or more of them.
          const around = [0, 1, 2, 3, 4, 5].map((e) => {
            const [nc, nr] = neighbor(c, r, e);
            return nc < 0 || nr < 0 || nc >= cols || nr >= rows || open(map, nc, nr);
          });
          const runs = around.filter((o, e) => o && !around[(e + 5) % 6]).length;
          const count = around.filter(Boolean).length;
          if (count < 6) expect({c, r, runs, count, ok: runs === 1 && count >= 2}).toMatchObject({ok: true});
        }));
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

  it("gets walls from Auto Barriers that leave its open ground open, through every exit", () => {
    for (const [seed, tags] of [[7, []], [7, ["burrow", "coral"]], [7, ["hub", "cavities", "paths"]], ...[1, 2, 3, 4, 5, 6].map((n) => [n, [TAGS[n], TAGS[n + 5]]])]) {
      const map = generateCellMap({...options, seed, connections: 4, tags});
      const result = autoBarriers(map);
      expect(result.error).toBeNull();
      expect(result.openEdge).toBe(false);
      expect(result.connections.map((c) => c.identifier).sort()).toEqual(["east", "north", "south", "west"]);
      const feetDimensions = mapSize(map.grid);
      const fill = computeMapFill({feetDimensions, barriers: result.barriers, connections: result.connections, fillPoints: result.fillPoints});
      // Each line connection has open ground on one side (past slivers
      // where the walls' rounded ends split it).
      const lines = fill.edges.filter((e) => e.kind === "connection" && Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) > 0.01);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(lines.every((e) => [e.left, e.right].includes("open"))).toBe(true);
    }
  });

  // As the validators check them: every piece of every exit's line, however
  // short, with open ground on exactly one side. At zone-build's sizes,
  // rounding used to leave walls short of the east and north exits' lines.
  it("walls big maps so every piece of every exit's line has open ground on one side", {timeout: 60000}, () => {
    for (const [seed, tags] of [[41, ["hub", "paths"]], [5, ["coral", "paths"]], [12, ["wet", "paths"]], [3, ["cavities", "paths"]], [8, ["burrow", "rough", "paths"]], [21, ["chamber", "paths"]]]) {
      const map = generateCellMap({cols: 100, rows: 100, seed, tags, exits: ["north", "east", "south", "west"]});
      const result = autoBarriers(map);
      expect(result.error).toBeNull();
      expect(result.openEdge).toBe(false);
      const fill = computeMapFill({feetDimensions: mapSize(map.grid), barriers: result.barriers, connections: result.connections, fillPoints: result.fillPoints});
      const pieces = fill.edges.filter((e) => e.kind === "connection");
      expect(pieces.filter((e) => [e.left, e.right].filter((s) => s === "open").length !== 1)).toEqual([]);
    }
  });

  it("puts exits on the sides it's given, at the spot along each it's given", () => {
    const {connections: _count, ...rest} = options;
    for (const seed of [1, 7, 11]) {
      const map = generateCellMap({...rest, seed, exits: ["east", "north"]});
      expect(validateCellMap(map)).toEqual([]);
      expect(map.exits.map((e) => e.side)).toEqual(["north", "east"]);
    }
    // Near the north side's start (west) and the west side's end (south).
    const map = generateCellMap({...rest, exits: [{side: "north", at: 0.1}, {side: "west", at: 0.9}]});
    const [north, west] = map.exits;
    expect(north.from).toBeLessThanOrEqual(4);
    expect(west.to).toBeGreaterThanOrEqual(26);
    expect(generateCellMap({...rest, exits: []})).not.toHaveProperty("exits");
  });

  it("refuses tags it doesn't know, too many connections, and bad exits", () => {
    const {connections: _count, ...rest} = options;
    expect(() => generateCellMap({...options, tags: ["huge"]})).toThrow(/unknown tags: huge/);
    expect(() => generateCellMap({...options, connections: 5})).toThrow(/connections must be 0 to 4/);
    expect(() => generateCellMap({...options, exits: ["north"]})).toThrow(/not both/);
    expect(() => generateCellMap({...rest, exits: ["up"]})).toThrow(/unknown exit side: up/);
    expect(() => generateCellMap({...rest, exits: ["north", {side: "north"}]})).toThrow(/two exits on the north side/);
    expect(() => generateCellMap({...rest, exits: [{side: "east", at: 1.5}]})).toThrow(/at must be 0 to 1/);
  });
});

describe("generateCellMap for a dungeon", () => {
  const options = {cols: 40, rows: 30, seed: 5, exits: ["west", "east"], theme: "dungeon"};

  it("makes the same valid square map for the same options", () => {
    const map = generateCellMap(options);
    expect(map.grid).toEqual({type: "square", cols: 40, rows: 30});
    expect(validateCellMap(map)).toEqual([]);
    expect(generateCellMap(options)).toEqual(map);
    expect(map.places.length).toBeGreaterThan(1);
  });

  it("joins all its open ground, reaching the edge only at its exits", () => {
    for (const seed of [1, 2, 3, 4]) {
      const map = generateCellMap({...options, seed});
      const open = (c, r) => map.cells[r]?.[c] !== undefined && map.cells[r][c] !== "T";
      const seen = new Set();
      const start = (() => { for (let r = 0; r < 30; r++) for (let c = 0; c < 40; c++) if (open(c, r)) return [c, r]; })();
      const stack = [start];
      while (stack.length) {
        const [c, r] = stack.pop();
        if (seen.has(`${c},${r}`) || !open(c, r)) continue;
        seen.add(`${c},${r}`);
        for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) stack.push([c + dc, r + dr]);
      }
      let total = 0;
      for (let r = 0; r < 30; r++) for (let c = 0; c < 40; c++) if (open(c, r)) total++;
      expect(seen.size).toBe(total);
      expect(map.exits.map((e) => e.side)).toEqual(["east", "west"]);
    }
  });

  it("is walled by Auto Barriers", () => {
    const result = autoBarriers(generateCellMap(options));
    expect(result.error).toBeNull();
    expect(result.barriers.length).toBeGreaterThan(0);
  });

  it("leaves out puddles when dry", () => {
    const map = generateCellMap({...options, tags: ["dry"]});
    expect(map.cells.join("")).not.toMatch(/[~w]/);
  });

  it("makes a big room in the middle with one way in, for vault", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateCellMap({cols: 100, rows: 100, seed, exits: ["west", "east"], theme: "dungeon", tags: ["vault"]});
      expect(validateCellMap(map)).toEqual([]);
      const open = (c, r) => map.cells[r][c] !== "T";
      for (let r = 35; r < 65; r++) for (let c = 35; c < 65; c++) expect(open(c, r)).toBe(true);
      const outside = [];
      for (let i = 35; i < 65; i++) outside.push(["w", open(34, i)], ["e", open(65, i)], ["n", open(i, 34)], ["s", open(i, 65)]);
      const doors = outside.filter(([, isOpen]) => isOpen);
      expect(doors.length).toBeGreaterThan(0);
      expect(doors.length).toBeLessThanOrEqual(2);
      expect(new Set(doors.map(([side]) => side)).size).toBe(1);
    }
  });

  it("mixes in rooms that aren't rectangles", () => {
    const rooms = generateCellMap({cols: 100, rows: 100, seed: 2, theme: "dungeon"}).places;
    expect(rooms.some(({polygon}) => polygon.length > 6)).toBe(true);
  });
});
