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
// A structure is { id, name, tags, collection, source, palette, storeyFt, materials, floor,
// foundation, storeys, components, objects, walk }:
// - palette: as a built object's (builtObjects.js), for its materials, images and params.
// - storeyFt: floor to floor, whole feet. Storey `level` n's floor is n * storeyFt above the
//   structure's base; levels below 0 dig into the ground.
// - materials: what it's made of, { name: { color, thicknessFt, tile, inside } }: color indexes
//   the palette; thicknessFt is how thick a wall of it is; tile is a tiled image it wears, { image,
//   every, jitter } as a built object's piece wears one, and inside another for walls' inside
//   faces (the sides with floor), the tile if absent.
// - floor: the material its floors are made of.
// - foundation: what fills down from the ground floor to the ground, { kind, material }, kind one
//   of FOUNDATIONS.
// - storeys: each { level, floor: ["x,z", ...], edges: { edge: { material, opening, sill, top } } }:
//   floor lists the cells with floor; each edge with a wall says its material, and may have an
//   opening
//   ("door" or "window") from `sill` feet up to `top` feet up (a door's sill is 0).
// - components: structural pieces snapped to the grid (COMPONENTS), each { type, level, material,
//   ... }: material, one of its materials, defaults to its floor's. Flights (stairs and ramps) and
//   spans start at cell `at` and run `run` cells toward `facing` (0 to 3: north, east, south,
//   west), `width` cells wide to the right of that. A flight climbs `rise` feet, a storey unless
//   said; a span is a level deck, with railings down its sides unless `rails` is false. A railing
//   runs along `edges`. A roof covers `size` [w, d] cells from `at`, on top of its storey's walls:
//   `shape` is one of ROOF_SHAPES, `pitch` its rise over run, `overhangFt` how far it reaches past
//   its cells; a gable or hip's ridge runs along `ridge` ("x" or "z"), and a lean-to slopes down
//   toward `facing`; `ends` is the material of a gable's end walls, its walls' if absent.
// - objects: library objects placed in it, each { type, at: [x, y, z] feet from the anchor's
//   base, yaw, scale, colors, texts }, as world objects are.
// - walk: the walk data, baked by bakeWalk on save (see there); readers bake it again.

export const CELL_FT = 4;
export const REACH_CELLS = 16; // so a structure reaches at most 64 ft from its anchor
export const LEVELS = { least: -4, most: 6 };
export const STOREY_FT = { least: 6, most: 30, start: 10 };
export const WALL_FT = { least: 0.25, most: 4 };
export const FOUNDATIONS = ["plinth", "posts", "stilts"];
export const FLOOR_FT = 0.5; // how thick floors are, under their level's height
export const OPENINGS = ["door", "window"];
export const ROOF_SHAPES = ["gable", "hip", "lean-to", "flat"];
export const ROOF = { pitch: { least: 0, most: 3 }, overhangFt: { least: 0, most: 4 } };
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
    palette: [
      { color: "#8a6a4a", param: true, name: "wood" },
      { color: "#8c8a84", param: true, name: "stone" },
    ],
    storeyFt: STOREY_FT.start,
    materials: { timber: { color: 0, thicknessFt: 0.75 }, stone: { color: 1, thicknessFt: 1.5 } },
    floor: "timber",
    foundation: { kind: "plinth", material: "stone" },
    storeys: [{ level: 0, floor: [], edges: {} }],
    components: [],
    objects: [],
  };
}

// --- components ---

// Each component type: what it needs, checked by `problems` (a list of messages), and how it
// walks, `walk(component, structure)`: { cells: { key: [heights] }, edges: { key: kind }, level }
// for its level (its own, unless it says). Heights are feet above the structure's base at a cell's
// corners, in WALK_CORNERS order.
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

const runProblems = (c) => [
  ...(Array.isArray(c.at) && inCells(...c.at) ? [] : ["needs a cell to start from"]),
  ...([0, 1, 2, 3].includes(c.facing) ? [] : ["should face 0 to 3 (north, east, south, west)"]),
  ...(isCount(c.run) ? [] : ["needs a run of whole cells"]),
  ...(c.width === undefined || isCount(c.width) ? [] : ["needs a width of whole cells"]),
];
const flightProblems = (c) => [...runProblems(c), ...(c.rise === undefined || (c.rise > 0 && c.rise <= STOREY_FT.most * 2) ? [] : ["needs a rise in feet"])];

// A span: a level deck along its run, railed down both sides unless `rails` is false.
function span(c, structure) {
  const { cells } = flight({ ...c, rise: 0 }, structure);
  const edges = {};
  if (c.rails !== false) {
    const width = c.width ?? 1;
    const [fx, fz] = STEPS[c.facing];
    const [rx, rz] = STEPS[(c.facing + 1) % 4];
    for (let i = 0; i < c.run; i++) {
      edges[edgeToward(c.at[0] + fx * i, c.at[1] + fz * i, (c.facing + 3) % 4)] = "railing";
      edges[edgeToward(c.at[0] + fx * i + rx * (width - 1), c.at[1] + fz * i + rz * (width - 1), (c.facing + 1) % 4)] = "railing";
    }
  }
  return { cells, edges };
}

// How high a roof's top is over a point (x, z, in feet from the anchor), in feet above the base:
// its storey's top at the edges of its cells, rising with its pitch, and lower out over the
// overhang.
export function roofHeight(c, structure) {
  const top = (c.level + 1) * structure.storeyFt;
  const [x0, z0] = c.at.map((v) => v * CELL_FT);
  const [x1, z1] = [x0 + c.size[0] * CELL_FT, z0 + c.size[1] * CELL_FT];
  const inward = {
    flat: () => 0,
    "lean-to": (x, z) => [z - z0, x1 - x, z1 - z, x - x0][c.facing],
    gable: (x, z) => (c.ridge === "z" ? Math.min(x - x0, x1 - x) : Math.min(z - z0, z1 - z)),
    hip: (x, z) => Math.min(x - x0, x1 - x, z - z0, z1 - z),
  }[c.shape];
  return (x, z) => top + c.pitch * inward(x, z);
}

// A roof walks on the level above its storey, where its cells' corners are as high as its top.
function roof(c, structure) {
  const height = roofHeight(c, structure);
  const cells = {};
  for (let i = 0; i < c.size[0]; i++) {
    for (let j = 0; j < c.size[1]; j++) {
      const [x, z] = [c.at[0] + i, c.at[1] + j];
      cells[cellKey(x, z)] = WALK_CORNERS.map(([cx, cz]) => round(height((x + cx) * CELL_FT, (z + cz) * CELL_FT)));
    }
  }
  return { cells, edges: {}, level: c.level + 1 };
}

const roofProblems = (c) => [
  ...(Array.isArray(c.at) && inCells(...c.at) && Array.isArray(c.size) && c.size.every((n) => isCount(n)) && inCells(c.at[0] + c.size[0] - 1, c.at[1] + c.size[1] - 1) ? [] : ["needs a cell to start from and a size in whole cells, within reach"]),
  ...(ROOF_SHAPES.includes(c.shape) ? [] : [`should be one of ${ROOF_SHAPES.join(", ")}`]),
  ...(c.pitch >= ROOF.pitch.least && c.pitch <= ROOF.pitch.most ? [] : [`needs a pitch from ${ROOF.pitch.least} to ${ROOF.pitch.most}`]),
  ...(c.overhangFt >= ROOF.overhangFt.least && c.overhangFt <= ROOF.overhangFt.most ? [] : [`needs an overhang from ${ROOF.overhangFt.least} to ${ROOF.overhangFt.most} ft`]),
  ...((c.shape === "lean-to" ? [0, 1, 2, 3].includes(c.facing) : c.shape === "flat" || ["x", "z"].includes(c.ridge)) ? [] : ["needs a ridge (x or z), or for a lean-to a way down (0 to 3)"]),
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
  span: { problems: (c) => [...runProblems(c), ...(c.rails === undefined || typeof c.rails === "boolean" ? [] : ["should be railed or not"])], walk: span },
  roof: { problems: roofProblems, walk: roof },
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
  if (!Array.isArray(s.palette) || !Array.isArray(s.storeys) || !Array.isArray(s.components) || !Array.isArray(s.objects) || typeof s.materials !== "object" || !s.materials) {
    return [...out, "it needs a palette, materials, storeys, components and objects"];
  }
  if (s.palette.filter((p) => p.param).length > MAX_PARAMS) out.push(`more than ${MAX_PARAMS} of its colors are parameters`);
  for (const p of s.palette) if (!/^#[0-9a-f]{6}$/i.test(p.color ?? "")) out.push(`${JSON.stringify(p.color)} isn't a #rrggbb color`);
  if (!(Number.isInteger(s.storeyFt) && s.storeyFt >= STOREY_FT.least && s.storeyFt <= STOREY_FT.most)) out.push(`its storeys should be ${STOREY_FT.least} to ${STOREY_FT.most} whole feet`);
  if (!(FOUNDATIONS.includes(s.foundation?.kind) && s.materials[s.foundation.material])) out.push(`its foundation should be one of ${FOUNDATIONS.join(", ")}, of one of its materials`);
  if (!s.materials[s.floor]) out.push("its floor should be one of its materials");
  for (const [name, m] of Object.entries(s.materials)) {
    if (!(m?.thicknessFt >= WALL_FT.least && m.thicknessFt <= WALL_FT.most)) out.push(`its ${name} walls should be ${WALL_FT.least} to ${WALL_FT.most} ft thick`);
    if (!(Number.isInteger(m?.color) && s.palette[m.color])) out.push(`its ${name}'s color isn't in the palette`);
    for (const key of ["tile", "inside"]) {
      const t = m?.[key];
      if (t !== undefined && !(typeof t.image === "string" && t.every >= 0.1 && t.jitter >= 0 && t.jitter <= 1)) out.push(`its ${name}'s ${key === "tile" ? "tiled image" : "inside image"} needs an image, a width (feet) and a jitter (0 to 1)`);
    }
  }
  const levels = s.storeys.map((storey) => storey.level);
  if (new Set(levels).size < levels.length) out.push("two of its storeys are on the same level");
  for (const storey of s.storeys) {
    const name = `storey ${storey.level}`;
    if (!(Number.isInteger(storey.level) && storey.level >= LEVELS.least && storey.level <= LEVELS.most)) out.push(`${name} should be a level from ${LEVELS.least} to ${LEVELS.most}`);
    if (!Array.isArray(storey.floor) || !storey.floor.every((key) => /^-?\d+,-?\d+$/.test(key) && inCells(...parseCell(key)))) out.push(`${name}'s floor should list cells within ${REACH_CELLS} of the anchor`);
    for (const [key, edge] of Object.entries(storey.edges ?? {})) {
      if (!isEdge(key)) out.push(`${name} has an edge ${JSON.stringify(key)} that isn't one`);
      else if (!s.materials[edge.material]) out.push(`${name}'s edge ${key} is an unknown material, ${JSON.stringify(edge.material)}`);
      else if (edge.opening !== undefined && !(OPENINGS.includes(edge.opening) && edge.sill >= 0 && edge.top > edge.sill && edge.top <= s.storeyFt && (edge.opening === "window" || edge.sill === 0))) {
        out.push(`${name}'s edge ${key} needs a door from the floor, or a window, with a sill below its top, within the storey`);
      }
    }
  }
  s.components.forEach((c, n) => {
    const kind = COMPONENTS[c.type];
    const name = `component ${n + 1}`;
    if (!kind) return out.push(`${name} is an unknown type, ${JSON.stringify(c.type)}`);
    if (!levels.includes(c.level)) out.push(`${name} is on level ${c.level}, which has no storey`);
    for (const message of kind.problems(c)) out.push(`${name} (${c.type}) ${message}`);
    for (const key of ["material", "ends"]) if (c[key] !== undefined && !s.materials[c[key]]) out.push(`${name} (${c.type}) is made of an unknown material, ${JSON.stringify(c[key])}`);
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
  const levels = new Map(); // level -> { cells, edges }
  const at = (level) => {
    if (!levels.has(level)) levels.set(level, { level, cells: {}, edges: {} });
    return levels.get(level);
  };
  for (const storey of structure.storeys) {
    const height = storey.level * structure.storeyFt;
    const { cells, edges } = at(storey.level);
    for (const key of storey.floor) cells[key] = [height, height, height, height];
    for (const [key, edge] of Object.entries(storey.edges ?? {})) edges[key] = edgeWalk(edge);
  }
  // Components after floors, so a flight replaces the floor it stands on; a roof under a floor
  // above it gives way.
  for (const c of structure.components) {
    const walk = COMPONENTS[c.type].walk(c, structure);
    const { cells, edges } = at(walk.level ?? c.level);
    const floor = new Set(structure.storeys.find((s) => s.level === walk.level)?.floor ?? []);
    for (const [key, heights] of Object.entries(walk.cells)) if (!floor.has(key)) cells[key] = heights;
    Object.assign(edges, walk.edges);
  }
  const storeys = [...levels.values()].sort((a, b) => a.level - b.level);
  // Below ground, a cell opens to the sky unless some storey above it, up to the ground floor, has
  // a floor there.
  const covered = new Set();
  const cut = new Set();
  for (const storey of [...storeys].reverse()) {
    if (storey.level > 0) continue;
    if (storey.level < 0) for (const key of Object.keys(storey.cells)) if (!covered.has(key)) cut.add(key);
    for (const key of structure.storeys.find((s) => s.level === storey.level)?.floor ?? []) covered.add(key);
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
