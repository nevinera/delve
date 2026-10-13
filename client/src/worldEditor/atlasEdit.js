// The atlas layer's edits (see AtlasCanvas): moving a map, a whole zone, or
// one corner of a zone's outline, each kept within the atlas's rules
// (docs/schema/world.md#atlas). A move that would break one stops where it
// would: it slides along whatever's in the way when it can, otherwise stops
// short of it. sizes is {zone: {map: {width, height}}}.
import {atlasRects, quadsOverlap, rectInside, rectsOverlap, simpleQuad} from "./atlasGeometry";

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
  return Object.entries(atlas.zones).every(([key, other]) => key === zone || !simpleQuad(other.outline) || !quadsOverlap(outline, other.outline));
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

// The atlas with corner `index` of the zone's outline at `to`, or as near
// as it can get: the outline staying a simple quad around all its maps,
// clear of every other zone's.
export function moveCorner(atlas, sizes, zone, index, to) {
  const entry = atlas.zones[zone];
  if (!entry) return atlas;
  const rects = atlasRects({zones: {[zone]: entry}}, sizes);
  const outlineAt = (p) => entry.outline.map((q, i) => (i === index ? round(p) : q));
  const valid = (p) => {
    const outline = outlineAt(p);
    return simpleQuad(outline) && rects.every((r) => rectInside(r, outline)) && outlineClear(atlas, zone, outline);
  };
  const from = entry.outline[index];
  const at = valid(from) ? constrainMove(from, to, valid) : to;
  return withZone(atlas, zone, {...entry, outline: outlineAt(at)});
}
