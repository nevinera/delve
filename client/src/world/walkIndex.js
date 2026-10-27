import { structureOf } from "./objects.js";
import { CELL_FT, bakeWalk, cellKey, parseCell, placedWalk, quartersOf, turnCell } from "./structures.js";

// Walking on placed structures (plans/structures.md, "Connections"): the walk data of the
// structures among a tile's objects, indexed by world cell (structures.js CELL_FT square, cell
// (x, z) covering x * CELL_FT to (x + 1) * CELL_FT), in continent feet. Nothing links one
// structure to another or to the ground: a walker steps from cell to cell wherever an edge doesn't
// block and the surfaces meet within a step.
//
// A tile's walk is { cells: Map "x,z" -> [{ heights, level }], edges: Map edge -> [{ kind,
// heights: [least, most] }], under: Set "x,z", cut: Set "x,z" }: heights are a cell's corners
// (WALK_CORNERS order) in feet above sea level; under lists the cells over a storey below ground,
// where the ground doesn't count for walking, and cut those where the ground is cut away to show
// it (structures.js bakeWalk).

// Edge kinds that stop a walker.
export const BLOCKING = new Set(["wall", "window", "railing"]);

export function tileWalk(objects = []) {
  const walk = { cells: new Map(), edges: new Map(), under: new Set(), cut: new Set() };
  const add = (map, key, value) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const object of objects) {
    const structure = structureOf(object.type);
    if (!structure) continue;
    const quarters = quartersOf(object.yaw);
    const placed = placedWalk(structure, { at: object.at, yaw: quarters, base: object.base });
    for (const { cell, heights, level } of placed.cells) {
      add(walk.cells, cellKey(...cell), { heights, level });
      if (level < 0) walk.under.add(cellKey(...cell));
    }
    for (const { edge, kind, heights } of placed.edges) add(walk.edges, edge, { kind, heights });
    // The cut cells, placed as the walk cells are.
    const [ax, az] = [Math.round(object.at[0] / CELL_FT), Math.round(object.at[1] / CELL_FT)];
    for (const key of (structure.walk ?? bakeWalk(structure)).cut) {
      const [x, z] = turnCell(...parseCell(key), quarters).cell;
      walk.cut.add(cellKey(x + ax, z + az));
    }
  }
  return walk;
}

// The height of a cell's surface at continent feet (x, z) within it, between its corners.
export function surfaceAt({ heights }, x, z) {
  const fx = x / CELL_FT - Math.floor(x / CELL_FT);
  const fz = z / CELL_FT - Math.floor(z / CELL_FT);
  const [nw, ne, se, sw] = heights;
  const north = nw + (ne - nw) * fx;
  const south = sw + (se - sw) * fx;
  return north + (south - north) * fz;
}

// What an object at continent feet (x, z) stands on, with the ground there at `ground`: the lowest
// structure floor not under the ground, or with only floors under it (a cellar open to the sky),
// the highest of those, or with no floors the ground.
export function floorAt(walk, x, z, ground) {
  const floors = (walk?.cells.get(cellKey(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT))) ?? []).map((cell) => surfaceAt(cell, x, z));
  if (!floors.length) return ground;
  const over = floors.filter((h) => h >= ground - 0.5);
  return over.length ? Math.min(...over) : Math.max(...floors);
}

// Where a walker with its feet at `feet` stands at (x, z), from the structure surfaces there and
// the ground (null where it doesn't count): the highest one within `step` above the feet, or with
// none that low, the lowest (too high to step onto, which a move up to it can tell).
export function standOn(surfaces, ground, feet, step) {
  const heights = [...surfaces, ...(ground === null ? [] : [ground])];
  if (!heights.length) return null;
  const reachable = heights.filter((h) => h <= feet + step);
  return reachable.length ? Math.max(...reachable) : Math.min(...heights);
}

// The ends of an edge, [[x0, z0], [x1, z1]] in continent feet.
export function edgeEnds(key) {
  const [x, z, side] = key.split(",");
  const [x0, z0] = [Number(x) * CELL_FT, Number(z) * CELL_FT];
  return side === "n" ? [[x0, z0], [x0 + CELL_FT, z0]] : [[x0, z0], [x0, z0 + CELL_FT]];
}

// How far (x, z) is from an edge.
export function edgeDistance(key, x, z) {
  const [[x0, z0], [x1, z1]] = edgeEnds(key);
  const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / (CELL_FT * CELL_FT)));
  return Math.hypot(x - (x0 + (x1 - x0) * t), z - (z0 + (z1 - z0) * t));
}

// The edges of the cells within `reach` cells of (x, z), as keys.
export function edgesNear(x, z, reach = 1) {
  const [cx, cz] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
  const keys = [];
  for (let dz = -reach; dz <= reach + 1; dz++) {
    for (let dx = -reach; dx <= reach + 1; dx++) keys.push(`${cx + dx},${cz + dz},n`, `${cx + dx},${cz + dz},w`);
  }
  return keys;
}
