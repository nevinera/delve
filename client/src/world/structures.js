import { MAX_PARAMS, newObjectId } from "./builtObjects.js";

// Structures: buildings and other things you walk on or into (plans/structures.md), stored per
// world as structures/<id>.json in the same collections as built objects.
//
// A structure is laid out on a grid of CELL_FT cells, in storeys. Cell (x, z) covers x to x + 1
// and z to z + 1 in cells from the structure's anchor, a corner of the world's grid (x east, z
// south). Cells stay within REACH_CELLS of the anchor each way. An edge is named by a cell and a
// side, "x,z,n" (its north side) or "x,z,w" (its west side); a cell's south side is the north side
// of the cell below it, and its east side the west side of the cell beside it.
//
// A structure is { id, name, tags, collection, source, palette, storeyFt, foundation, walls,
// storeys, components, objects, walk }:
// - palette: as a built object's (builtObjects.js), for its images and its params.
// - storeyFt: floor to floor, whole feet. Storey `level` n's floor is n * storeyFt above the
//   structure's base; levels below 0 dig into the ground.
// - foundation: what fills down from the ground floor to the ground, one of FOUNDATIONS.
// - walls: the kinds of wall it uses, { name: { thicknessFt } }.
// - storeys: each { level, floor: ["x,z", ...], edges: { edge: { wall, opening, sill, top, faces } } }:
//   floor lists the cells with floor; each edge with a wall says its kind, and may have an opening
//   ("door" or "window") from `sill` feet up to `top` feet up (a door's sill is 0); faces are the
//   images on its two faces, [north or west, south or east], each an image id or null.
// - components: structural pieces snapped to the grid (COMPONENTS), each { type, level, ... }.
// - objects: library objects placed in it, each { type, at: [x, y, z] feet from the anchor's
//   base, yaw, scale, colors, texts }, as world objects are.
// - walk: the walk data, baked by bakeWalk on save (see there); readers bake it again.

export const CELL_FT = 4;
export const REACH_CELLS = 16; // so a structure reaches at most 64 ft from its anchor
export const LEVELS = { least: -4, most: 6 };
export const STOREY_FT = { least: 6, most: 30, start: 10 };
export const WALL_FT = { least: 0.25, most: 4 };
export const FOUNDATIONS = ["plinth", "posts", "stilts"];
export const OPENINGS = ["door", "window"];
export const STRUCTURE_PREFIX = "structure:";
export const structurePath = (id) => `structures/${id}.json`;

// Directions as quarter turns from north, the way components face: north (-z), east, south, west.
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export const cellKey = (x, z) => `${x},${z}`;
export const parseCell = (key) => key.split(",").map(Number);
export const edgeKey = (x, z, side) => `${x},${z},${side}`;

// The edge between a cell and the next one in a direction (0 to 3, as STEPS).
export function edgeToward(x, z, direction) {
  return [edgeKey(x, z, "n"), edgeKey(x + 1, z, "w"), edgeKey(x, z + 1, "n"), edgeKey(x, z, "w")][direction];
}

export function emptyStructure(name = "new structure", random = Math.random) {
  return {
    id: newObjectId(random),
    name,
    palette: [],
    storeyFt: STOREY_FT.start,
    foundation: "plinth",
    walls: { timber: { thicknessFt: 0.75 }, stone: { thicknessFt: 1.5 } },
    storeys: [{ level: 0, floor: [], edges: {} }],
    components: [],
    objects: [],
  };
}

// --- components ---

// Each component type: what it needs, checked by `problems` (a list of messages), and how it
// walks, `walk(component, structure)`: { cells: { key: [heights] }, edges: { key: kind } } for its
// level. Heights are feet above the structure's base at a cell's corners, in WALK_CORNERS order.
const inCells = (x, z) => Number.isInteger(x) && Number.isInteger(z) && Math.abs(x + 0.5) < REACH_CELLS && Math.abs(z + 0.5) < REACH_CELLS;
const isCount = (n, most = REACH_CELLS * 2) => Number.isInteger(n) && n >= 1 && n <= most;

// A flight going up toward `facing` from cell `at`: `run` cells long and `width` wide, the width
// spreading to the right of the way up, climbing `rise` feet (a storey, unless said).
function flight({ level, at, facing, run, width = 1, rise }, structure) {
  const climb = rise ?? structure.storeyFt;
  const base = level * structure.storeyFt;
  const [fx, fz] = STEPS[facing];
  const [rx, rz] = STEPS[(facing + 1) % 4];
  const cells = {};
  for (let i = 0; i < run; i++) {
    for (let j = 0; j < width; j++) {
      const [x, z] = [at[0] + fx * i + rx * j, at[1] + fz * i + rz * j];
      // How far up the flight each corner is: along the way up, from this cell's start.
      cells[cellKey(x, z)] = WALK_CORNERS.map(([cx, cz]) => {
        const along = i + (fx ? (fx > 0 ? cx : 1 - cx) : fz > 0 ? cz : 1 - cz);
        return round(base + (climb * along) / run);
      });
    }
  }
  return { cells, edges: {} };
}

const flightProblems = (c) => [
  ...(Array.isArray(c.at) && inCells(...c.at) ? [] : ["needs a cell to start from"]),
  ...([0, 1, 2, 3].includes(c.facing) ? [] : ["should face 0 to 3 (north, east, south, west)"]),
  ...(isCount(c.run) ? [] : ["needs a run of whole cells"]),
  ...(c.width === undefined || isCount(c.width) ? [] : ["needs a width of whole cells"]),
  ...(c.rise === undefined || (c.rise > 0 && c.rise <= STOREY_FT.most * 2) ? [] : ["needs a rise in feet"]),
];

export const COMPONENTS = {
  // Steps drawn, but walked as a slope.
  stairs: { problems: flightProblems, walk: flight },
  ramp: { problems: flightProblems, walk: flight },
  // A railing along edges: it blocks walking, not sight.
  railing: {
    problems: (c) => (Array.isArray(c.edges) && c.edges.length && c.edges.every(isEdge) ? [] : ["needs edges to run along"]),
    walk: (c) => ({ cells: {}, edges: Object.fromEntries(c.edges.map((e) => [e, "railing"])) }),
  },
};

// --- checking ---

function isEdge(key) {
  const m = /^(-?\d+),(-?\d+),([nw])$/.exec(key ?? "");
  return Boolean(m) && inCells(Number(m[1]), Number(m[2]));
}

// What's wrong with a structure, as a list of messages; empty when it's fine.
export function problems(structure) {
  const out = [];
  const s = structure;
  if (!/^[0-9a-z]{8}$/.test(s.id ?? "")) out.push("its id should be 8 letters and digits");
  if (!Array.isArray(s.palette) || !Array.isArray(s.storeys) || !Array.isArray(s.components) || !Array.isArray(s.objects) || typeof s.walls !== "object" || !s.walls) {
    return [...out, "it needs a palette, walls, storeys, components and objects"];
  }
  if (s.palette.filter((p) => p.param).length > MAX_PARAMS) out.push(`more than ${MAX_PARAMS} of its colors are parameters`);
  for (const p of s.palette) if (!/^#[0-9a-f]{6}$/i.test(p.color ?? "")) out.push(`${JSON.stringify(p.color)} isn't a #rrggbb color`);
  if (!(Number.isInteger(s.storeyFt) && s.storeyFt >= STOREY_FT.least && s.storeyFt <= STOREY_FT.most)) out.push(`its storeys should be ${STOREY_FT.least} to ${STOREY_FT.most} whole feet`);
  if (!FOUNDATIONS.includes(s.foundation)) out.push(`its foundation should be one of ${FOUNDATIONS.join(", ")}`);
  for (const [name, wall] of Object.entries(s.walls)) {
    if (!(wall?.thicknessFt >= WALL_FT.least && wall.thicknessFt <= WALL_FT.most)) out.push(`its ${name} walls should be ${WALL_FT.least} to ${WALL_FT.most} ft thick`);
  }
  const levels = s.storeys.map((storey) => storey.level);
  if (new Set(levels).size < levels.length) out.push("two of its storeys are on the same level");
  for (const storey of s.storeys) {
    const name = `storey ${storey.level}`;
    if (!(Number.isInteger(storey.level) && storey.level >= LEVELS.least && storey.level <= LEVELS.most)) out.push(`${name} should be a level from ${LEVELS.least} to ${LEVELS.most}`);
    if (!Array.isArray(storey.floor) || !storey.floor.every((key) => /^-?\d+,-?\d+$/.test(key) && inCells(...parseCell(key)))) out.push(`${name}'s floor should list cells within ${REACH_CELLS} of the anchor`);
    for (const [key, edge] of Object.entries(storey.edges ?? {})) {
      if (!isEdge(key)) out.push(`${name} has an edge ${JSON.stringify(key)} that isn't one`);
      else if (!s.walls[edge.wall]) out.push(`${name}'s edge ${key} is an unknown wall, ${JSON.stringify(edge.wall)}`);
      else if (edge.opening !== undefined && !(OPENINGS.includes(edge.opening) && edge.sill >= 0 && edge.top > edge.sill && edge.top <= s.storeyFt && (edge.opening === "window" || edge.sill === 0))) {
        out.push(`${name}'s edge ${key} needs a door from the floor, or a window, with a sill below its top, within the storey`);
      } else if (edge.faces !== undefined && !(Array.isArray(edge.faces) && edge.faces.length === 2 && edge.faces.every((f) => f === null || typeof f === "string"))) {
        out.push(`${name}'s edge ${key} should have two faces, each an image or none`);
      }
    }
  }
  s.components.forEach((c, n) => {
    const kind = COMPONENTS[c.type];
    const name = `component ${n + 1}`;
    if (!kind) return out.push(`${name} is an unknown type, ${JSON.stringify(c.type)}`);
    if (!levels.includes(c.level)) out.push(`${name} is on level ${c.level}, which has no storey`);
    for (const message of kind.problems(c)) out.push(`${name} (${c.type}) ${message}`);
  });
  s.objects.forEach((o, n) => {
    if (!(typeof o.type === "string" && Array.isArray(o.at) && o.at.length === 3 && o.at.every(Number.isFinite) && Number.isFinite(o.yaw) && o.scale > 0)) out.push(`object ${n + 1} needs a type, where (x, y, z), a yaw and a scale`);
  });
  return out;
}

// --- walking ---

// A cell's corners, in the order walk heights list them: north-west, north-east, south-east,
// south-west, as [x, z] within the cell.
export const WALK_CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const round = (v) => Math.round(v * 100) / 100;

// What a wall edge is to walking: a door lets you through; a wall or window doesn't, but a window
// lets sight through.
const edgeWalk = (edge) => edge.opening ?? "wall";

// The structure's walk data, which the walker and game server read instead of its storeys and
// components: { storeys: [{ level, cells: { "x,z": [h0, h1, h2, h3] }, edges: { edge: kind } }],
// cut: ["x,z", ...] }. Heights are feet above the base at each cell's corners (WALK_CORNERS); a
// floor's are all its level's height, a flight's rise. Edge kinds are "wall", "door", "window" and
// "railing"; open edges are left out. cut lists the cells where a storey below ground opens up
// past ground level, where the ground has to be cut away.
export function bakeWalk(structure) {
  const storeys = [...structure.storeys]
    .sort((a, b) => a.level - b.level)
    .map((storey) => {
      const height = storey.level * structure.storeyFt;
      const cells = Object.fromEntries(storey.floor.map((key) => [key, [height, height, height, height]]));
      const edges = Object.fromEntries(Object.entries(storey.edges ?? {}).map(([key, edge]) => [key, edgeWalk(edge)]));
      for (const c of structure.components) {
        if (c.level !== storey.level) continue;
        const walk = COMPONENTS[c.type].walk(c, structure);
        Object.assign(cells, walk.cells);
        Object.assign(edges, walk.edges);
      }
      return { level: storey.level, cells, edges };
    });
  // Below ground, a cell opens to the sky unless some storey above it, up to the ground floor, has
  // a floor there.
  const covered = new Set();
  const cut = new Set();
  for (const storey of [...storeys].reverse()) {
    if (storey.level > 0) continue;
    if (storey.level < 0) for (const key of Object.keys(storey.cells)) if (!covered.has(key)) cut.add(key);
    const floor = structure.storeys.find((s) => s.level === storey.level).floor;
    for (const key of floor) covered.add(key);
  }
  return { storeys, cut: [...cut].sort() };
}

// A structure ready to save: its walk data baked.
export const withWalk = (structure) => ({ ...structure, walk: bakeWalk(structure) });

// --- placing ---

// Turns cell-space point [x, z] by quarter turns, as a placement's yaw turns the structure: like
// three.js's rotation.y, a quarter turn takes +x to -z.
function turn([x, z], quarters) {
  for (let q = 0; q < ((quarters % 4) + 4) % 4; q++) [x, z] = [z, -x];
  return [x, z];
}

// A cell, turned with its structure by quarter turns: its new cell, and for each of its new
// corners (WALK_CORNERS order) which of its old ones lands there.
export function turnCell(x, z, quarters) {
  const turned = WALK_CORNERS.map(([cx, cz]) => turn([x + cx, z + cz], quarters));
  // (+ 0 turns -0 into 0.)
  const [nx, nz] = [Math.min(...turned.map((p) => p[0])) + 0, Math.min(...turned.map((p) => p[1])) + 0];
  const from = WALK_CORNERS.map(([cx, cz]) => turned.findIndex(([px, pz]) => px === nx + cx && pz === nz + cz));
  return { cell: [nx, nz], from };
}

// An edge, turned with its structure by quarter turns.
export function turnEdge(key, quarters) {
  const [x, z, side] = key.split(",");
  const middle = side === "n" ? [Number(x) + 0.5, Number(z)] : [Number(x), Number(z) + 0.5];
  const [mx, mz] = turn(middle, quarters);
  return Number.isInteger(mz) ? edgeKey(mx - 0.5, mz, "n") : edgeKey(mx, mz - 0.5, "w");
}

// A placed structure's walk surfaces in the world: { cells: [{ cell: [wx, wz], heights, level }],
// edges: [{ edge, kind, level, heights: [least, most] }] }, in world cells (CELL_FT feet, cell
// (wx, wz) covering wx * CELL_FT to (wx + 1) * CELL_FT) and feet above sea level. placement:
// { at: [x, z] feet, a corner of the world grid; yaw: quarter turns, 0 to 3; base: the ground
// floor's height }. An edge's heights are the storey's span, which it blocks.
export function placedWalk(structure, { at, yaw, base }) {
  const walk = structure.walk ?? bakeWalk(structure);
  const [ax, az] = [Math.round(at[0] / CELL_FT), Math.round(at[1] / CELL_FT)];
  const cells = [];
  const edges = [];
  for (const storey of walk.storeys) {
    for (const [key, heights] of Object.entries(storey.cells)) {
      const { cell, from } = turnCell(...parseCell(key), yaw);
      cells.push({ cell: [cell[0] + ax, cell[1] + az], heights: from.map((i) => round(base + heights[i])), level: storey.level });
    }
    const floor = base + storey.level * structure.storeyFt;
    for (const [key, kind] of Object.entries(storey.edges)) {
      const [x, z, side] = turnEdge(key, yaw).split(",");
      edges.push({ edge: edgeKey(Number(x) + ax, Number(z) + az, side), kind, level: storey.level, heights: [floor, floor + structure.storeyFt] });
    }
  }
  return { cells, edges };
}
