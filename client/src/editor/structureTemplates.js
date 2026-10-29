import { paletteColors } from "../world/builtObjects.js";
import { BUILTIN_STRUCTURE_COLLECTIONS } from "../world/builtinStructures.js";
import { cutSlab, raiseWall } from "../world/slabs.js";
import { CELL_FT, COMPONENTS, FLOOR_FT, parseCell } from "../world/structures.js";
import { roofPieces } from "./slabTool.js";

// Old structures (world/structures.js: storeys, walls, openings and components) rewrapped as
// templates (world/templates.js) of slabs and objects, drawn as structureMeshes.js drew them:
// floors and walls as slabs, doors and windows as holes, stairs as steps, ramps as slopes, spans
// as decks, railings as rails on posts, roofs as the roof tool makes them, with the walls under
// them risen to meet them, and furnishings as objects. The structure's anchor is the template's,
// and its base the anchor's height.

const OPENING_FT = 3; // how wide doors and windows are
const STEP_FT = 0.75; // about how tall a stair's steps are
const RAIL = { heightFt: 3, barFt: 0.25, thicknessFt: 0.3, postFt: 0.35 };
const ROOF_FT = 0.4; // how thick roofs are
const FOOTING_FT = { plinth: 2, posts: 3, stilts: 12 }; // how far foundations reach down
const POST_FT = { posts: 0.6, stilts: 0.35 };
const MOST_CELLS = 10; // the longest run of cells one slab covers, keeping it within a slab's reach
const RAIL_CELLS = 6; // the longest railing, its posts keeping it within a slab's corners
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// The template a structure makes, with the same id and name.
export function structureTemplate(structure) {
  const colors = paletteColors(structure);
  const surfaces = Object.fromEntries(
    Object.entries(structure.materials).map(([name, m]) => [name, m.tile ? { color: colors[m.color], tile: { image: m.tile.image, every: m.tile.every, jitter: m.tile.jitter ?? 0 }, palette: colors } : { color: colors[m.color] }]),
  );
  const slabs = [];
  const storeyWalls = new Map(); // level -> its walls' slabs
  for (const storey of structure.storeys) {
    const height = storey.level * structure.storeyFt;
    for (const [x0, z0, x1, z1] of rectangles(storey.floor.map(parseCell))) slabs.push(box(x0 * CELL_FT, z0 * CELL_FT, x1 * CELL_FT, z1 * CELL_FT, height, FLOOR_FT, surfaces[structure.floor]));
    const walls = runs(storey.edges).flatMap((run) => wall(run, structure, height, surfaces[run.material]));
    storeyWalls.set(storey.level, walls);
    slabs.push(...walls);
  }
  for (const c of structure.components) {
    const surface = surfaces[c.material ?? structure.floor];
    if (c.type === "stairs") slabs.push(...stairs(c, structure, surface));
    if (c.type === "ramp") slabs.push(ramp(c, structure, surface));
    if (c.type === "span") slabs.push(...span(c, structure, surface));
    if (c.type === "railing") slabs.push(...railings(c.edges, c.level * structure.storeyFt, surface));
    if (c.type === "roof") {
      const roofs = roof(c, structure, surface);
      slabs.push(...roofs);
      // The storey's walls under it rise to meet it, as its gable ends and high sides did.
      const [x0, z0] = c.at.map((v) => v * CELL_FT);
      const [x1, z1] = [x0 + c.size[0] * CELL_FT, z0 + c.size[1] * CELL_FT];
      for (const w of storeyWalls.get(c.level) ?? []) {
        const [ax, , az] = w.at;
        if (ax < x0 - 2 || ax > x1 + 2 || az < z0 - 2 || az > z1 + 2) continue;
        const raised = raiseWall(w, roofs).wall;
        if (raised) Object.assign(w, raised);
      }
    }
  }
  slabs.push(...foundation(structure, surfaces[structure.foundation.material]));
  const objects = structure.objects.map(({ type, at: [x, y, z], yaw, scale, colors: c, texts }) => ({ type, at: [x, z], y, yaw, scale, ...(c ? { colors: c } : {}), ...(texts ? { texts } : {}) }));
  return { id: structure.id, name: structure.name, ...(structure.tags ? { tags: structure.tags } : {}), slabs, objects };
}

// A level slab over the rectangle x0..x1, z0..z1 (feet), its top at `top`.
function box(x0, z0, x1, z1, top, thickness, surface) {
  return {
    at: [x0, top, z0].map(tidy),
    turn: [0, 0, 0],
    outline: [
      [0, 0],
      [x1 - x0, 0],
      [x1 - x0, z1 - z0],
      [0, z1 - z0],
    ].map((p) => p.map(tidy)),
    thickness: tidy(thickness),
    surface,
  };
}

// Cells as rectangles, [x0, z0, x1, z1] in cells, none more than MOST_CELLS a side: each row's
// runs, stacked down while the rows below cover them.
export function rectangles(cells) {
  const left = new Set(cells.map(([x, z]) => `${x},${z}`));
  const out = [];
  const sorted = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, z] of sorted) {
    if (!left.has(`${x},${z}`)) continue;
    let w = 1;
    while (w < MOST_CELLS && left.has(`${x + w},${z}`)) w++;
    let d = 1;
    while (d < MOST_CELLS && Array.from({ length: w }, (_, i) => left.has(`${x + i},${z + d}`)).every(Boolean)) d++;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) left.delete(`${x + i},${z + j}`);
    out.push([x, z, x + w, z + d]);
  }
  return out;
}

// A storey's walls as runs along a line, of one material, up to MOST_CELLS edges: { side, line,
// from, to, material, openings: [[cell, edge], ...] }, side "n" running along x at z = line, "w"
// along z at x = line, from cell `from` to `to` (exclusive).
function runs(edges, most = MOST_CELLS) {
  const lines = new Map();
  for (const [key, edge] of Object.entries(edges)) {
    const [x, z, side] = key.split(",");
    const [line, at] = side === "n" ? [Number(z), Number(x)] : [Number(x), Number(z)];
    const name = `${side},${line}`;
    if (!lines.has(name)) lines.set(name, []);
    lines.get(name).push({ at, edge, side, line });
  }
  const out = [];
  for (const list of lines.values()) {
    list.sort((a, b) => a.at - b.at);
    for (const { at, edge, side, line } of list) {
      const last = out.at(-1);
      if (last && last.side === side && last.line === line && last.to === at && last.material === edge.material && last.to - last.from < most) {
        last.to++;
        if (edge.opening) last.openings.push([at, edge]);
      } else out.push({ side, line, from: at, to: at + 1, material: edge.material, openings: edge.opening ? [[at, edge]] : [] });
    }
  }
  return out;
}

// A run's wall: from a floor's thickness under its storey to the next, half its thickness either
// side of the line and past each end, with its doors and windows cut through.
function wall({ side, line, from, to, material, openings }, structure, height, surface) {
  const thickness = structure.materials[material].thicknessFt;
  const t = thickness / 2;
  const [start, length] = [from * CELL_FT - t, (to - from) * CELL_FT + thickness];
  const tall = structure.storeyFt + FLOOR_FT;
  const bottom = height - FLOOR_FT;
  // Along x, its face on the north side, its thickness to the south; along z, its face on the
  // east, its thickness to the west.
  const slab =
    side === "n"
      ? { at: [start, bottom, line * CELL_FT - t], turn: [0, -90, 0] }
      : { at: [line * CELL_FT + t, bottom, start], turn: [-90, -90, 0] };
  let pieces = [
    {
      ...slab,
      at: slab.at.map(tidy),
      outline: [
        [0, 0],
        [length, 0],
        [length, tall],
        [0, tall],
      ].map((p) => p.map(tidy)),
      thickness,
      surface,
    },
  ];
  for (const [cell, edge] of openings) {
    const middle = (cell + 0.5) * CELL_FT - start;
    const hole = [
      [middle - OPENING_FT / 2, FLOOR_FT + edge.sill],
      [middle + OPENING_FT / 2, FLOOR_FT + edge.sill],
      [middle + OPENING_FT / 2, FLOOR_FT + edge.top],
      [middle - OPENING_FT / 2, FLOOR_FT + edge.top],
    ].map((p) => p.map(tidy));
    pieces = pieces.flatMap((piece) => cutSlab(piece, hole));
  }
  return pieces;
}

// A flight's frame: its start cell's back-left corner, the way up, and the way to its right.
function frame(c) {
  const [fx, fz] = DIRECTIONS[c.facing];
  const [rx, rz] = DIRECTIONS[(c.facing + 1) % 4];
  const origin = [(c.at[0] + 0.5) * CELL_FT - (fx + rx) * (CELL_FT / 2), (c.at[1] + 0.5) * CELL_FT - (fz + rz) * (CELL_FT / 2)];
  // A point `a` feet up the flight and `b` across it, in feet from the anchor.
  return (a, b) => [origin[0] + fx * a + rx * b, origin[1] + fz * a + rz * b];
}

// The level slab over a stretch of a flight: a feet up it to a2, across all of it.
function stretch(c, a, a2, top, thickness, surface) {
  const at = frame(c);
  const corners = [at(a, 0), at(a2, (c.width ?? 1) * CELL_FT)];
  const [x0, x1] = [Math.min(corners[0][0], corners[1][0]), Math.max(corners[0][0], corners[1][0])];
  const [z0, z1] = [Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][1], corners[1][1])];
  return box(x0, z0, x1, z1, top, thickness, surface);
}

// Stairs: a solid step every STEP_FT or so up.
function stairs(c, structure, surface) {
  const height = c.level * structure.storeyFt;
  const rise = c.rise ?? structure.storeyFt;
  const run = c.run * CELL_FT;
  const steps = Math.max(1, Math.round(rise / STEP_FT));
  return Array.from({ length: steps }, (_, k) => stretch(c, (k * run) / steps, ((k + 1) * run) / steps, height + ((k + 1) * rise) / steps, ((k + 1) * rise) / steps + FLOOR_FT, surface));
}

// A ramp: a slab sloping up its run.
function ramp(c, structure, surface) {
  const height = c.level * structure.storeyFt;
  const rise = c.rise ?? structure.storeyFt;
  const run = c.run * CELL_FT;
  const [fx, fz] = DIRECTIONS[c.facing];
  const angle = Math.atan2(rise, run);
  // Yawed to face up the flight, its v runs up the slope and its u to the flight's left.
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI;
  const [sx, sz] = frame(c)(0, (c.width ?? 1) * CELL_FT);
  return {
    at: [sx, height, sz].map(tidy),
    turn: [tidy(yaw), tidy((-angle * 180) / Math.PI), 0],
    outline: [
      [0, 0],
      [(c.width ?? 1) * CELL_FT, 0],
      [(c.width ?? 1) * CELL_FT, Math.hypot(run, rise)],
      [0, Math.hypot(run, rise)],
    ].map((p) => p.map(tidy)),
    thickness: FLOOR_FT,
    surface,
  };
}

// A span: a level deck along its run, with its railings.
function span(c, structure, surface) {
  const height = c.level * structure.storeyFt;
  const deck = stretch(c, 0, c.run * CELL_FT, height, FLOOR_FT, surface);
  return [deck, ...railings(Object.keys(COMPONENTS.span.walk(c, structure).edges), height, surface)];
}

// Railings along edges, from `height`: per run along a line, a rail on posts at each cell corner.
function railings(edges, height, surface) {
  const t = RAIL.thicknessFt / 2;
  const p = RAIL.postFt / 2;
  return runs(Object.fromEntries(edges.map((key) => [key, { material: "rail" }])), RAIL_CELLS).flatMap(({ side, line, from, to }) => {
    const [start, length] = [from * CELL_FT - p, (to - from) * CELL_FT + 2 * p];
    const rail = {
      at: (side === "n" ? [start, height, line * CELL_FT - t] : [line * CELL_FT + t, height, start]).map(tidy),
      turn: side === "n" ? [0, -90, 0] : [-90, -90, 0],
      outline: [
        [0, 0],
        [length, 0],
        [length, RAIL.heightFt],
        [0, RAIL.heightFt],
      ].map((q) => q.map(tidy)),
      thickness: RAIL.thicknessFt,
      surface,
    };
    // The gaps between the posts, open from the ground up to the rail.
    const gaps = Array.from({ length: to - from }, (_, k) => [
      [k * CELL_FT + 2 * p, -1],
      [(k + 1) * CELL_FT, -1],
      [(k + 1) * CELL_FT, RAIL.heightFt - RAIL.barFt],
      [k * CELL_FT + 2 * p, RAIL.heightFt - RAIL.barFt],
    ]);
    return cutSlab(rail, ...gaps.map((g) => g.map((q) => q.map(tidy))));
  });
}

// A roof as the roof tool makes it, its top where the old roof's was.
function roof(c, structure, surface) {
  const eaves = (c.level + 1) * structure.storeyFt - ROOF_FT;
  const [x0, z0] = c.at.map((v) => v * CELL_FT);
  const [x1, z1] = [x0 + c.size[0] * CELL_FT, z0 + c.size[1] * CELL_FT];
  const style = { gable: "gable", hip: "hip", "lean-to": "shed", flat: "flat" }[c.shape];
  const [dx, dz] = DIRECTIONS[c.facing ?? 0];
  return roofPieces([x0, eaves, z0], [x1, eaves, z1], 0, {
    style,
    pitch: (Math.atan(c.pitch) * 180) / Math.PI,
    overhang: c.overhangFt,
    thickness: ROOF_FT,
    surface,
    ridge: c.ridge === "z" ? 1 : c.ridge === "x" ? 0 : undefined,
    rising: c.shape === "lean-to" ? [-dx, -dz] : undefined,
  });
}

// The foundation under the ground floor, but not over a storey below it: a plinth under its
// cells, or posts at their corners.
function foundation(structure, surface) {
  const ground = structure.storeys.find((s) => s.level === 0);
  if (!ground) return [];
  const below = new Set(structure.storeys.filter((s) => s.level < 0).flatMap((s) => s.floor));
  const cells = ground.floor.filter((key) => !below.has(key)).map(parseCell);
  const { kind } = structure.foundation;
  const depth = FOOTING_FT[kind];
  if (kind === "plinth") return rectangles(cells).map(([x0, z0, x1, z1]) => box(x0 * CELL_FT, z0 * CELL_FT, x1 * CELL_FT, z1 * CELL_FT, -FLOOR_FT, depth - FLOOR_FT, surface));
  const corners = new Set(cells.flatMap(([x, z]) => [`${x},${z}`, `${x + 1},${z}`, `${x},${z + 1}`, `${x + 1},${z + 1}`]));
  const p = POST_FT[kind] / 2;
  return [...corners].map((key) => {
    const [x, z] = parseCell(key).map((v) => v * CELL_FT);
    return box(x - p, z - p, x + p, z + p, -FLOOR_FT, depth - FLOOR_FT, surface);
  });
}

const tidy = (v) => Math.round(v * 100) / 100 + 0;

// The built-in structures' collections as templates, but for those dug into the ground, as builtin/templates.json holds them: [{ id,
// name, templates }], one slab or object a line.
export function builtinTemplatesJson() {
  const line = (v) => JSON.stringify(v);
  const list = (items, indent) => (items.length ? `[\n${items.map((i) => `${indent}  ${line(i)}`).join(",\n")}\n${indent}]` : "[]");
  const template = ({ slabs, objects, ...rest }) =>
    `      {\n${Object.entries(rest)
      .map(([k, v]) => `        ${line(k)}: ${line(v)},\n`)
      .join("")}        "slabs": ${list(slabs, "        ")},\n        "objects": ${list(objects, "        ")}\n      }`;
  // Structures with storeys underground are left out: a template can't dig into the ground.
  const collections = BUILTIN_STRUCTURE_COLLECTIONS.map(({ structures, ...c }) => ({ ...c, structures: structures.filter((s) => s.storeys.every((storey) => storey.level >= 0)) }))
    .filter((c) => c.structures.length)
    .map(({ id, name, structures }) => `  {\n    "id": ${line(id)},\n    "name": ${line(name)},\n    "templates": [\n${structures.map((s) => template(structureTemplate(s))).join(",\n")}\n    ]\n  }`);
  return `[\n${collections.join(",\n")}\n]\n`;
}
