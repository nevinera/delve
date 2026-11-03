import { BUILT_PREFIX, OBJECT_TYPES, builtOf, specOf } from "./objects.js";
import { pieceGeometry } from "../render/builtMeshes.js";
import { limitedHull } from "./limitedHull.js";
import { cutMesh } from "./sightCuts.js";

// The shapes file: for each kind of object that blocks line of sight, a
// closed mesh of a few dozen faces standing in for it, so the game server and the client test sight
// against that and not the object's pieces: the convex hull of its pieces, with any holes cut
// through it by hand (sightCuts.js). Baked whenever the world is stored.

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

// The shapes file for these kinds, as { version, kinds: { type: mesh } }, with only the kinds
// that block sight, sorted.
export function shapesFile(types) {
  const kinds = {};
  for (const type of [...new Set(types)].sort()) {
    if (!blocksSight(type)) continue;
    const mesh = meshOf(type);
    if (mesh) kinds[type] = mesh;
  }
  return { version: SHAPES_VERSION, kinds };
}

// The shapes file as text, a kind to a line so a change shows as the kinds it changed.
export function shapesText({ version, kinds }) {
  const lines = Object.entries(kinds).map(([type, shape]) => `    ${JSON.stringify(type)}: ${JSON.stringify(shape)}`);
  return `{\n  "version": ${version},\n  "kinds": {${lines.length ? `\n${lines.join(",\n")}\n  ` : ""}}\n}\n`;
}

// A kind's mesh at scale 1, { points: [[x, y, z], ...], faces: [[a, b, c, ...], ...] }, in the
// kind's own axes with y = 0 where it's seated on the ground, faces wound counterclockwise seen
// from outside. Null for a kind with nothing to wrap.
export function meshOf(type) {
  return type.startsWith(BUILT_PREFIX) ? objectMesh(builtOf(type)) : hullAround(prismPoints(specOf(type)));
}

// A built object's mesh, as meshOf gives it, whether or not it blocks sight.
export function objectMesh(object) {
  const hull = hullAround(builtPoints(object));
  return hull && cutMesh(hull, object.sightCuts);
}

// The convex hull around points, at most MAX_CORNERS corners.
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
