import { BUILT_PREFIX, OBJECT_TYPES, builtOf, specOf } from "../world/objects.js";
import { pieceGeometry } from "./builtMeshes.js";
import { limitedHull } from "./limitedHull.js";

// The shapes file (docs/formats/shapes.md): for each kind of object that blocks line of sight, the
// convex hulls that stand in for it, so the game server and the client test sight against a few
// planes and not the object's pieces. Baked whenever the world is stored.

export const SHAPES_VERSION = 1;
const ROUND = 100; // points are kept to 1/100 ft
const MAX_CORNERS = 32; // most corners a hull has
const PRISM_SIDES = 8; // for code-made kinds, which have only a footprint and a height

// Whether objects of a kind block line of sight: built objects unless they say not, code-made kinds
// as OBJECT_TYPES says.
export function blocksSight(type) {
  const built = builtOf(type);
  if (built) return built.blocksSight !== false;
  return OBJECT_TYPES[type] ? OBJECT_TYPES[type].blocksSight !== false : false;
}

// The shapes file for these kinds, as { version, kinds: { type: { hulls: [hull, ...] } } }, with
// only the kinds that block sight, sorted.
export function shapesFile(types) {
  const kinds = {};
  for (const type of [...new Set(types)].sort()) {
    if (!blocksSight(type)) continue;
    const hull = hullOf(type);
    if (hull) kinds[type] = { hulls: [hull] };
  }
  return { version: SHAPES_VERSION, kinds };
}

// The shapes file as text, a kind to a line so a change shows as the kinds it changed.
export function shapesText({ version, kinds }) {
  const lines = Object.entries(kinds).map(([type, shape]) => `    ${JSON.stringify(type)}: ${JSON.stringify(shape)}`);
  return `{\n  "version": ${version},\n  "kinds": {${lines.length ? `\n${lines.join(",\n")}\n  ` : ""}}\n}\n`;
}

// A kind's hull at scale 1, { points: [[x, y, z], ...], faces: [[a, b, c], ...] }, in the kind's own
// axes with y = 0 where it's seated on the ground, faces wound counterclockwise seen from outside.
// Null for a kind with nothing to wrap.
export function hullOf(type) {
  return type.startsWith(BUILT_PREFIX) ? objectHull(builtOf(type)) : hullAround(prismPoints(specOf(type)));
}

// A built object's hull, as hullOf gives it, whether or not it blocks sight.
export function objectHull(object) {
  return hullAround(builtPoints(object));
}

// The hull around points, as hullOf gives it.
export function hullAround(points) {
  const hull = limitedHull(points, MAX_CORNERS);
  return hull && { ...hull, points: hull.points.map((p) => p.map((v) => Math.round(v * ROUND) / ROUND + 0)) };
}

// Every corner of a built object's pieces, holes left out.
function builtPoints(object) {
  if (!object) return [];
  const points = [];
  for (const piece of object.pieces) {
    if (piece.cut) continue;
    const position = pieceGeometry(piece).attributes.position;
    for (let i = 0; i < position.count; i++) points.push([position.getX(i), position.getY(i), position.getZ(i)]);
  }
  return points;
}

// A code-made kind as an upright prism over its footprint, its height tall, sunk as it's drawn.
function prismPoints(spec) {
  if (!spec?.footprint || spec.footprint.open) return [];
  const { footprint, height } = spec;
  const sink = (spec.sink ?? 0.1) * height;
  let outline;
  if (footprint.circle) outline = ring(footprint.circle, 0);
  else if (footprint.capsule) {
    const [r, half] = footprint.capsule;
    outline = [...ring(r, -half).filter(([x]) => x <= -half), ...ring(r, half).filter(([x]) => x >= half)];
  } else {
    const [w, d] = footprint.rect.map((v) => v / 2);
    outline = [[-w, -d], [w, -d], [w, d], [-w, d]];
  }
  return outline.flatMap(([x, z]) => [[x, -sink, z], [x, height - sink, z]]);
}

function ring(r, x0) {
  return Array.from({ length: PRISM_SIDES }, (_, k) => {
    const a = ((k + 0.5) / PRISM_SIDES) * Math.PI * 2;
    return [x0 + Math.cos(a) * r, Math.sin(a) * r];
  });
}
