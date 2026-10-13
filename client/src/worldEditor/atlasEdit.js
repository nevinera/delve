// The atlas layer's edits (see AtlasCanvas): moving a map, a whole zone, or
// one vertex of a zone's outline (adding and removing them too), and
// bending links, each kept within the atlas's rules
// (docs/schema/world.md#atlas). A move that would break one stops where it
// would: it slides along whatever's in the way when it can, otherwise stops
// short of it. sizes is {zone: {map: {width, height}}}.
import {atlasRects, polygonsOverlap, rectInside, rectsOverlap, simplePolygon} from "./atlasGeometry";

export const MAX_OUTLINE_POINTS = 64;

const BISECT_STEPS = 12;

// The furthest point toward `to` along the line from `from` (valid) that
// valid() accepts.
function furthest(from, to, valid) {
  if (valid(to)) return to;
  let [lo, hi] = [0, 1];
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (valid({x: from.x + (to.x - from.x) * mid, y: from.y + (to.y - from.y) * mid})) lo = mid;
    else hi = mid;
  }
  return {x: from.x + (to.x - from.x) * lo, y: from.y + (to.y - from.y) * lo};
}

// The nearest point to `to` that a move from `from` (valid) can reach:
// as far along the line as valid() allows, then sliding the rest of the
// way along one axis and then the other, whichever order gets closer.
export function constrainMove(from, to, valid) {
  if (valid(to)) return to;
  const stopped = furthest(from, to, valid);
  const slide = (start, first) => {
    const mid = furthest(start, first === "x" ? {x: to.x, y: start.y} : {x: start.x, y: to.y}, valid);
    return furthest(mid, first === "x" ? {x: mid.x, y: to.y} : {x: to.x, y: mid.y}, valid);
  };
  const distance = (p) => Math.hypot(to.x - p.x, to.y - p.y);
  return [slide(stopped, "x"), slide(stopped, "y")].reduce((best, p) => (distance(p) < distance(best) ? p : best));
}

const round = ({x, y}) => ({x: Math.round(x), y: Math.round(y)});

function withZone(atlas, zone, entry) {
  return {...atlas, zones: {...atlas.zones, [zone]: entry}};
}

function outlineClear(atlas, zone, outline) {
  return Object.entries(atlas.zones).every(([key, other]) => key === zone || !simplePolygon(other.outline) || !polygonsOverlap(outline, other.outline));
}

// The atlas with zone's map at `to` (its origin), or as near as it can get.
export function moveMap(atlas, sizes, zone, map, to) {
  const entry = atlas.zones[zone];
  const size = sizes[zone]?.[map];
  if (!entry || !size) return atlas;
  const others = atlasRects(atlas, sizes).filter((r) => !(r.zone === zone && r.map === map));
  const valid = (p) => {
    const rect = {...round(p), ...size};
    return rectInside(rect, entry.outline) && !others.some((o) => rectsOverlap(rect, o));
  };
  const from = entry.maps[map];
  if (!valid(from)) return withZone(atlas, zone, {...entry, maps: {...entry.maps, [map]: round(to)}});
  return withZone(atlas, zone, {...entry, maps: {...entry.maps, [map]: round(constrainMove(from, to, valid))}});
}

const shifted = (entry, {x, y}) => ({
  outline: entry.outline.map((p) => ({x: p.x + x, y: p.y + y})),
  maps: Object.fromEntries(Object.entries(entry.maps).map(([key, p]) => [key, {x: p.x + x, y: p.y + y}])),
});

// The atlas with the zone (outline and maps) moved by `by`, or as far as it
// can go.
export function moveZone(atlas, zone, by) {
  const entry = atlas.zones[zone];
  if (!entry) return atlas;
  const valid = (p) => outlineClear(atlas, zone, shifted(entry, round(p)).outline);
  const at = valid({x: 0, y: 0}) ? round(constrainMove({x: 0, y: 0}, by, valid)) : round(by);
  return withZone(atlas, zone, {...entry, ...shifted(entry, at)});
}

// Whether outline would do for zone: a simple polygon around all its
// maps, clear of every other zone's.
function outlineFits(atlas, sizes, zone, outline) {
  const rects = atlasRects({zones: {[zone]: atlas.zones[zone]}}, sizes);
  return simplePolygon(outline) && rects.every((r) => rectInside(r, outline)) && outlineClear(atlas, zone, outline);
}

// The atlas with vertex `index` of the zone's outline at `to`, or as near
// as it can get (see outlineFits).
export function moveCorner(atlas, sizes, zone, index, to) {
  const entry = atlas.zones[zone];
  if (!entry) return atlas;
  const outlineAt = (p) => entry.outline.map((q, i) => (i === index ? round(p) : q));
  const valid = (p) => outlineFits(atlas, sizes, zone, outlineAt(p));
  const from = entry.outline[index];
  const at = valid(from) ? constrainMove(from, to, valid) : to;
  return withZone(atlas, zone, {...entry, outline: outlineAt(at)});
}

// The atlas with a new vertex in the middle of edge `edge` of the zone's
// outline (from vertex edge to the next), at index edge + 1; unchanged at
// MAX_OUTLINE_POINTS.
export function insertVertex(atlas, zone, edge) {
  const entry = atlas.zones[zone];
  if (!entry || entry.outline.length >= MAX_OUTLINE_POINTS) return atlas;
  const [a, b] = [entry.outline[edge], entry.outline[(edge + 1) % entry.outline.length]];
  const outline = [...entry.outline.slice(0, edge + 1), {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, ...entry.outline.slice(edge + 1)];
  return withZone(atlas, zone, {...entry, outline});
}

// The atlas without vertex `index` of the zone's outline, unless that would
// leave fewer than 3 or break the outline (see outlineFits).
export function removeVertex(atlas, sizes, zone, index) {
  const entry = atlas.zones[zone];
  if (!entry || entry.outline.length <= 3) return atlas;
  const outline = entry.outline.filter((_, i) => i !== index);
  return outlineFits(atlas, sizes, zone, outline) ? withZone(atlas, zone, {...entry, outline}) : atlas;
}

// The atlas with link `key` (see atlasLinks) bent through its midpoint
// plus offset, or straight again when offset is null.
export function bendLink(atlas, key, offset) {
  const {[key]: _, ...rest} = atlas.bends ?? {};
  const bends = offset ? {...rest, [key]: round(offset)} : rest;
  const {bends: __, ...withoutBends} = atlas;
  return Object.keys(bends).length ? {...withoutBends, bends} : withoutBends;
}
