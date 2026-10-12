import {describe, it, expect} from "vitest";
import {validateCellMap} from "../format";
import {exitCells, exitEdge, validateExits} from "../exits";
import {cellAt, cellCenter, cellCorners, cellPoint, hexDistance, hexLine, hexRays, mapSize, neighbor, pointAt} from "../hexGrid";
import {regionLoops, smoothLoop, unwarp, warp} from "../regions";
import {buildScene} from "../scene";
import {cacheKey, renderCellMap} from "../render";
import {buildSprites} from "../sprites";
import {CAVE, GLADE, STYLES, WINTER, pineShape, resolveStyle} from "../style";
import {THEMES} from "../format";
import clearing from "../examples/clearing.json";
import forestEdge from "../examples/forest-edge.json";
import woodlandTrail from "../examples/woodland-trail.json";

const tiny = (cells, seed = 1) => ({version: 1, theme: "glade", seed, grid: {type: "hex", cols: cells[0].length, rows: cells.length}, cells});

describe("validateCellMap", () => {
  it("accepts the examples", () => {
    for (const map of [clearing, forestEdge, woodlandTrail]) expect(validateCellMap(map)).toEqual([]);
  });

  it("names what's wrong", () => {
    const map = {...tiny(["..", ".."]), cells: ["..", ".x."]};
    expect(validateCellMap(map)).toEqual(['cells[1] has 3 cells, grid.cols is 2', 'cells[1] has unknown cells: "x"']);
    expect(validateCellMap({...tiny([".."]), grid: {type: "square", cols: 0, rows: 1}})).toEqual([
      "grid.type must be one of: hex",
      "grid.cols must be an integer from 1 to 200",
      "cells[0] has 2 cells, grid.cols is 0",
    ]);
  });

  it("checks the theme and its colors", () => {
    expect(validateCellMap({...tiny([".."]), theme: "caves"})).toEqual(["theme must be one of: glade, autumn, winter, cave"]);
    expect(validateCellMap({...tiny([".."]), colors: {meadow: "#aabbcc"}})).toEqual([]);
    expect(validateCellMap({...tiny([".."]), colors: {meadow: "green", sky: "#000000"}})).toEqual([
      'colors.meadow must be a "#rrggbb" color',
      expect.stringMatching(/^colors\.sky is not one of the theme's colors: meadow, tallGrass, /),
    ]);
  });
});

describe("exits", () => {
  const grid = {type: "hex", cols: 6, rows: 4};
  it("validates them", () => {
    expect(validateExits([{side: "north", from: 0, to: 5}, {side: "east", from: 1, to: 2}], grid)).toEqual([]);
    expect(validateExits([{side: "up", from: 0, to: 1}, {side: "south", from: 2, to: 6}, {side: "east", from: 3, to: 3}, {side: "east", from: 0, to: 0}], grid)).toEqual([
      "exits[0].side must be one of: north, east, south, west",
      "exits[1] must run from one cell to another along its side, 0 to 5",
      "exits[3] is a second exit on the east side",
    ]);
  });

  it("span their cells along the map's edge", () => {
    const {width, height} = mapSize(grid);
    expect(exitCells({side: "west", from: 1, to: 2}, grid)).toEqual([[0, 1], [0, 2]]);
    const [a, b] = exitEdge({side: "south", from: 0, to: 5}, grid);
    expect([a, b]).toEqual([{x: 0, y: height}, {x: width, y: height}]);
    const [c, d] = exitEdge({side: "east", from: 1, to: 1}, grid);
    expect(c.x).toBe(width);
    expect(d.y - c.y).toBeCloseTo(5);
  });
});

describe("bridges", () => {
  const big = () => ({...tiny(Array.from({length: 12}, () => ".".repeat(12)))});

  it("accepts straight bridges of up to 8 steps, matching the Ruby validator", () => {
    expect(validateCellMap({...big(), bridges: [{from: [2, 1], to: [2, 9]}, {from: [8, 8], to: [11, 6]}]})).toEqual([]);
  });

  it("names what's wrong with one", () => {
    expect(validateCellMap({...big(), bridges: [{from: [2, 1], to: [3, 5]}, {from: [2, 1], to: [2, 10]}, {from: [2, 1], to: [2, 12]}, {from: [4, 4], to: [4, 4]}]})).toEqual([
      "bridges[0] must run straight along the cells",
      "bridges[1] must reach 1 to 8 cells from its start",
      "bridges[2].to must be a cell on the grid, [col, row]",
      "bridges[3] must reach 1 to 8 cells from its start",
    ]);
  });
});

describe("hexLine", () => {
  it("lists the cells along a straight line, each a neighbor of the last", () => {
    for (const to of hexRays([5, 5], 4)) {
      const cells = hexLine([5, 5], to);
      expect(cells).toHaveLength(hexDistance([5, 5], to) + 1);
      cells.slice(1).forEach((cell, i) => expect(hexDistance(cells[i], cell)).toBe(1));
    }
    expect(hexLine([5, 5], [6, 7])).toBeNull();
  });
});

describe("resolveStyle", () => {
  it("is the theme's style without overrides", () => {
    expect(resolveStyle(tiny([".."]))).toBe(GLADE);
  });

  it("puts a map's colors over the palette, with their derived shades", () => {
    const style = resolveStyle({...tiny([".."]), colors: {crown: "#646464", trail: "#ffffff"}});
    expect(style.palette).toMatchObject({crown: "#646464", crownTones: [[[90, 90, 90], [110, 110, 110]]], trail: "#ffffff", trailEdge: "#adadad"});
    expect(style.palette.meadow).toBe(GLADE.palette.meadow);
    expect(style.key).toBe("glade:crown=#646464,trail=#ffffff");
  });

  it("keys the cache by colors", () => {
    const map = tiny([".."]);
    expect(cacheKey({...map, colors: {meadow: "#000000"}}, 10)).not.toBe(cacheKey(map, 10));
  });
});

describe("hexGrid", () => {
  it("puts neighbors one cell apart, across the edge they share", () => {
    for (const col of [2, 3]) {
      const corners = cellCorners(col, 4, 5);
      for (let edge = 0; edge < 6; edge++) {
        const [c, r] = neighbor(col, 4, edge);
        const a = cellCenter(col, 4, 5);
        const b = cellCenter(c, r, 5);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(5);
        const mid = {x: (corners[edge].x + corners[(edge + 1) % 6].x) / 2, y: (corners[edge].y + corners[(edge + 1) % 6].y) / 2};
        expect(mid.x).toBeCloseTo((a.x + b.x) / 2);
        expect(mid.y).toBeCloseTo((a.y + b.y) / 2);
      }
    }
  });

  it("finds the cell under a point", () => {
    const {x, y} = cellCenter(7, 3, 5);
    expect(cellAt(x + 1, y - 1.5, 5)).toEqual([7, 3]);
  });

  it("sizes the map to the grid", () => {
    const {width, height} = mapSize({cols: 2, rows: 1}, Math.sqrt(3));
    expect(width).toBeCloseTo(3.5);
    expect(height).toBeCloseTo(1.5 * Math.sqrt(3));
  });
});

describe("regionLoops", () => {
  it("outlines a lone cell with its six corners", () => {
    const loops = regionLoops(tiny(["...", ".T.", "..."]), "trees");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it("gives a meadow hole in the forest its own loop", () => {
    expect(regionLoops(tiny(["TTTTT", "TT.TT", "TTTTT"]), "trees")).toHaveLength(2);
  });

  it("keeps outlines off the map, past its edge", () => {
    const map = tiny(["TT", "TT"]);
    const {width, height} = mapSize(map.grid);
    const [loop] = regionLoops(map, "trees").map((l) => smoothLoop(l, 5, 1));
    expect(loop.every(({x, y}) => x < 0 || y < 0 || x > width || y > height)).toBe(true);
  });
});

describe("warp", () => {
  it("bends gently, the same way wherever a point is shared, and can be undone", () => {
    const points = Array.from({length: 200}, (_, i) => ({x: (i * 7.3) % 150, y: (i * 3.1) % 110}));
    for (const p of points) {
      const w = warp(p, 4);
      expect(warp({...p}, 4)).toEqual(w);
      expect(Math.hypot(w.x - p.x, w.y - p.y)).toBeLessThan(3);
      const back = unwarp(w, 4);
      expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.01);
    }
    // Not just a shift: points far apart move differently.
    const moves = points.map((p) => warp(p, 4).x - p.x);
    expect(Math.max(...moves) - Math.min(...moves)).toBeGreaterThan(1.5);
  });
});

describe("buildScene", () => {
  it("builds the same scene from the same map", () => {
    expect(buildScene(clearing)).toEqual(buildScene(structuredClone(clearing)));
  });

  it("changes with the seed", () => {
    expect(buildScene({...clearing, seed: 12}).crowns).not.toEqual(buildScene(clearing).crowns);
  });

  it("only changes what's near an edited cell", () => {
    const edited = {...clearing, cells: clearing.cells.map((row, r) => (r === 10 ? row.slice(0, 20) + "T" + row.slice(21) : row))};
    const before = new Set(buildScene(clearing).crowns.map((c) => `${c.x},${c.y}`));
    const added = buildScene(edited).crowns.filter((c) => !before.has(`${c.x},${c.y}`));
    const {x, y} = cellCenter(20, 10, 5);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => Math.hypot(c.x - x, c.y - y) < 5)).toBe(true);
  });
});

describe("cacheKey", () => {
  it("ignores the map's name but not its cells or seed", () => {
    expect(cacheKey({...clearing, name: "Other"}, 10)).toEqual(cacheKey(clearing, 10));
    expect(cacheKey({...clearing, seed: 99}, 10)).not.toEqual(cacheKey(clearing, 10));
    expect(cacheKey(clearing, 20)).not.toEqual(cacheKey(clearing, 10));
  });
});

describe("buildScene placements", () => {
  it("only puts crowns in the band along the forest's edge", () => {
    const solid = tiny(Array.from({length: 20}, () => "T".repeat(20)).map((row, r) => (r < 2 ? ".".repeat(20) : row)));
    const deepest = Math.max(...buildScene(solid).crowns.map((c) => c.y));
    expect(deepest).toBeLessThan(cellCenter(0, 6, 5).y);
  });

  it("picks variants that exist", () => {
    const scene = buildScene(clearing);
    for (const kind of ["crowns", "patches", "tufts"]) {
      expect(scene[kind].length).toBeGreaterThan(0);
      expect(scene[kind].every((p) => Number.isInteger(p.variant) && p.variant >= 0 && p.variant < GLADE.variants[kind])).toBe(true);
    }
  });
});

describe("ground terrains", () => {
  const map = tiny(["......", ".%%~~.", "......", "......"]);

  it("outlines tall grass and marsh as their own regions", () => {
    const scene = buildScene(map);
    expect(scene.grounds.map((g) => [g.terrain, g.loops.length])).toEqual([["tallGrass", 1], ["marsh", 1]]);
  });

  it("runs the ground beside water under its shore", () => {
    const map = tiny(["......", ".~~ww.", ".~~ww.", "......"]);
    const [marsh] = buildScene(map).grounds.filter((g) => g.terrain === "marsh");
    const drawnTo = Math.max(...marsh.loops.flat().map((p) => p.x));
    expect(drawnTo).toBeGreaterThan(cellCenter(3, 1, 5).x);
  });

  it("decorates each kind of ground with its own sprites", () => {
    const scene = buildScene({...map, cells: ["%%%%%%", "~~~~~~", "%%%%%%", "~~~~~~"]});
    expect(scene.tallTufts.length).toBeGreaterThan(0);
    expect(scene.hummocks.length).toBeGreaterThan(0);
    expect(scene.marshWater.length).toBe(scene.grounds.find((g) => g.terrain === "marsh").loops.length);
    expect(scene.tufts).toEqual([]);
    expect(scene.crowns).toEqual([]);
  });
});

describe("trails", () => {
  const forest = {...tiny(Array.from({length: 12}, () => "T".repeat(12))), trails: [{width: 1, points: [[0, 6], [5, 3], [11, 6]]}]};

  it("puts cell points at cell centers, interpolating between them", () => {
    expect(cellPoint(3, 2, 5)).toEqual(cellCenter(3, 2, 5));
    expect(cellPoint(4, 2, 5)).toEqual(cellCenter(4, 2, 5));
    const mid = cellPoint(3.5, 2, 5);
    expect(mid.x).toBeCloseTo((cellCenter(3, 2, 5).x + cellCenter(4, 2, 5).x) / 2);
    expect(mid.y).toBeCloseTo((cellCenter(3, 2, 5).y + cellCenter(4, 2, 5).y) / 2);
  });

  it("curves through every point it was given, in feet, bent as the map's edges are", () => {
    const [trail] = buildScene(forest).trails;
    expect(trail.width).toBe(5);
    // (The ends are near the map's edge, so bend less.)
    for (const [col, row] of [forest.trails[0].points[1]]) {
      const p = warp(cellPoint(col, row, 5), forest.seed);
      expect(trail.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
    }
  });

  it("clears no trees for a trail: crowns and the forest's mass are as without it", () => {
    // Trees, with an open strip through the middle for the trail.
    const strip = {...tiny(Array.from({length: 12}, (_, r) => (r >= 5 && r <= 7 ? "." : "T").repeat(12))), trails: [{width: 1, points: [[0, 6], [11, 6]]}]};
    const scene = buildScene(strip);
    const bare = buildScene({...strip, trails: []});
    expect(scene.crowns.length).toBeGreaterThan(0);
    expect(scene.crowns).toEqual(bare.crowns);
    expect(scene.forest).toEqual(bare.forest);
  });

  it("fades out where a trail just stops, but not where it meets another", () => {
    const map = {...tiny(Array.from({length: 12}, () => ".".repeat(12))), trails: [
      {width: 1, points: [[2, 6], [9, 6]]},
      {width: 1, points: [[6, 2], [6, 6]]},
    ]};
    const [main, branch] = buildScene(map).trails;
    expect(main.fades).toHaveLength(2);
    expect(main.caps).toEqual([]);
    expect(main.spots.length).toBeGreaterThan(0);
    expect(branch.fades).toHaveLength(1);
    expect(branch.caps).toHaveLength(1);
    const joint = warp(cellPoint(6, 6, 5), map.seed);
    expect(branch.caps[0].x).toBeCloseTo(joint.x);
    expect(branch.caps[0].y).toBeCloseTo(joint.y);
  });

  it("keeps grass and reeds off the trail", () => {
    const ground = {...tiny(["%%%%%%%%%%%%", "~~~~~~~~~~~~", "%%%%%%%%%%%%", "~~~~~~~~~~~~", "............"]), trails: [{width: 1.5, points: [[-1, 2], [12, 2]]}]};
    const scene = buildScene(ground);
    const [trail] = scene.trails;
    for (const kind of ["tufts", "tallTufts", "reeds"]) {
      expect(scene[kind].every((p) => Math.min(...trail.points.map((q) => Math.hypot(p.x - q.x, p.y - q.y))) > trail.width / 2)).toBe(true);
    }
    expect(scene.tallTufts.length).toBeLessThan(buildScene({...ground, trails: []}).tallTufts.length);
  });

  it("keeps a trail that runs to the map's edge on it", () => {
    const map = {...tiny(Array.from({length: 12}, () => ".".repeat(12))), trails: [{width: 1, points: [[4, 6], [pointAt(0, 30, 5)[0], pointAt(0, 30, 5)[1]]]}]};
    const [trail] = buildScene(map).trails;
    expect(trail.points[trail.points.length - 1].x).toBeCloseTo(0);
    expect(trail.fades).toHaveLength(1);
  });

  it("draws narrower trails first, so wider ones run over them", () => {
    const map = {...tiny(Array.from({length: 12}, () => ".".repeat(12))), trails: [
      {type: "road", width: 1.6, points: [[1, 6], [10, 6]]},
      {type: "deerPath", width: 0.4, points: [[6, 1], [6, 11]]},
    ]};
    const strokes = [];
    let lineWidth = 0;
    const ctx = new Proxy({}, {
      get: (_, name) => (name === "createLinearGradient" ? () => ({addColorStop: () => {}}) : name === "stroke" ? () => strokes.push(lineWidth) : () => {}),
      set: (_, name, value) => {
        if (name === "lineWidth") lineWidth = value;
        return true;
      },
    });
    renderCellMap(map, {createCanvas: (width, height) => ({width, height, getContext: () => ctx})});
    const deer = 0.4 * 5;
    const road = 1.6 * 5;
    expect(strokes.lastIndexOf(deer)).toBeGreaterThan(-1);
    expect(strokes.lastIndexOf(deer)).toBeLessThan(strokes.indexOf(road));
  });

  it("validates trails", () => {
    expect(validateCellMap({...forest, trails: [{width: 0, points: [[1, 1]]}, {width: 1, points: [[1, 1], [2]]}]})).toEqual([
      "trails[0].width must be a positive number",
      "trails[0].points must list at least two points",
      "trails[1].points must each be [col, row]",
    ]);
  });
});

describe("sprites and rendering", () => {
  const fakeContext = () => new Proxy({}, {get: (_, name) => (name === "createLinearGradient" ? () => ({addColorStop: () => {}}) : () => {})});
  const fakeCanvas = (width, height) => ({width, height, getContext: fakeContext});

  it("makes each style's variants, sized for the largest placement", () => {
    const sprites = buildSprites(GLADE, 5, 10, fakeCanvas);
    expect(sprites.crowns).toHaveLength(GLADE.variants.crowns);
    expect(sprites.patches).toHaveLength(GLADE.variants.patches);
    for (const kind of Object.keys(GLADE.variants).filter((k) => k !== "hatches" && k !== "hummocks")) expect(sprites[kind]).toHaveLength(GLADE.variants[kind]);
    // Only rock is hatched, and it has no crowns.
    expect(sprites.hatches).toEqual([]);
    const cave = buildSprites(CAVE, 5, 10, fakeCanvas);
    expect(cave.hatches).toHaveLength(CAVE.variants.hatches);
    expect(cave.crowns).toEqual([]);
    expect(sprites.crowns[0].canvas.width).toBe(Math.ceil(2 * sprites.crowns[0].extent * 10));
  });

  it("times each step and reports what it drew", () => {
    const {canvas, timings, stats} = renderCellMap(clearing, {createCanvas: fakeCanvas});
    expect(Object.keys(timings)).toEqual(["scene", "sprites", "paint"]);
    expect(stats).toMatchObject({width: canvas.width, height: canvas.height});
    expect(stats.crowns).toBeGreaterThan(0);
  });
});

describe("themes", () => {
  const map = (theme) => ({...tiny(["TTTTTTTT", "T..%%~~T", "T.www..T", "T.wTw..T", "T..ww..T", "TTTTTTTT"]), theme, trails: [{width: 1, points: [[1, 1], [6, 4]]}], bridges: [{from: [1, 2], to: [5, 4]}]});

  it("share their cells, so a map can change theme", () => {
    const [first, ...rest] = Object.values(THEMES);
    for (const theme of rest) expect(theme.terrains).toEqual(first.terrains);
    for (const key of Object.keys(THEMES)) {
      expect(STYLES[key]).toBeDefined();
      expect(validateCellMap(map(key))).toEqual([]);
    }
  });

  it("each render, with their own decorations", () => {
    const fakeCanvas = (width, height) => ({width, height, getContext: () => new Proxy({}, {get: (_, name) => (name === "createLinearGradient" ? () => ({addColorStop: () => {}}) : () => {})})});
    for (const key of Object.keys(THEMES)) expect(() => renderCellMap(map(key), {createCanvas: fakeCanvas})).not.toThrow();
    const cave = buildScene(map("cave"));
    expect(cave.crowns).toEqual([]);
    expect(cave.hatches.length).toBeGreaterThan(0);
    expect(buildScene(map("winter"), WINTER).ice.length).toBeGreaterThan(0);
    expect(buildScene(map("glade")).ice).toEqual([]);
  });

  it("snow some pines heavily and leave others bare", () => {
    const snow = Array.from({length: WINTER.variants.crowns}, (_, i) => pineShape(WINTER, i).dabs.length);
    expect(Math.min(...snow)).toBeLessThanOrEqual(1);
    expect(Math.max(...snow)).toBeGreaterThanOrEqual(6);
  });
});
