import polygonClipping from "polygon-clipping";
import { TILE_FT } from "../world/constants.js";
import { EDGE_REACH_FT, riverReachFt } from "../world/generator.js";
import { tilesTouched } from "./region.js";

// Which tiles an edit changes, so the editor can highlight them and regenerate just those. Each
// kind of change reaches as far as the generator lets it: a moved coast reshapes the shore around
// it, and a river carves along its whole length. Info pins, hubs and roads don't touch the ground
// yet. Every hit tile brings its neighbours along.
//
// Height pins shape one smooth surface across the continent, so a height pin change marks every
// zoned tile. Biome borders can move anywhere a biome pin's region reaches, and rivers and zone
// edges bend them, so when there are biome pins, any biome pin, river or region change does too.

const key = (tx, tz) => `${tx},${tz}`;

// Tile keys ("x,z") that differ between two versions of a continent, each { zones, pins, strokes,
// pools } with zones as stored ({ region }) and the sketch's pins, strokes and pools.
export function changedTiles(before, after) {
  const tiles = new Set();
  const changed = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  const regions = (c) => c.zones.map((z) => z.region).filter((r) => r.length);
  const pinsOf = (c, kind) => c.pins.filter((p) => p.kind === kind);
  const rivers = (c) => c.strokes.filter((s) => s.kind === "river");

  const hasBiomes = [...before.pins, ...after.pins].some((p) => p.kind === "biome");
  const regionsMoved = changed(regions(before), regions(after));
  const biomesMoved = hasBiomes && (changed(pinsOf(before, "biome"), pinsOf(after, "biome")) || changed(rivers(before), rivers(after)) || regionsMoved);
  if (biomesMoved || changed(pinsOf(before, "height"), pinsOf(after, "height"))) {
    for (const region of [...regions(before), ...regions(after)]) for (const [tx, tz] of tilesTouched(region)) addAround(tiles, tx, tz, 1);
  }

  if (regionsMoved) {
    const [a, b] = [regions(before), regions(after)];
    const moved = !a.length ? b.flat() : !b.length ? a.flat() : openRings(polygonClipping.xor(polygonClipping.union(...a), polygonClipping.union(...b)));
    const reach = Math.ceil(EDGE_REACH_FT / TILE_FT);
    for (const [tx, tz] of tilesTouched(moved)) addAround(tiles, tx, tz, reach);
  }

  for (const [old, now] of pairs(rivers(before), rivers(after))) {
    if (!changed(old, now)) continue;
    for (const stroke of [old, now]) {
      if (stroke) addNearLine(tiles, stroke.points, riverReachFt(stroke.width ?? 30) / TILE_FT);
    }
  }

  // A pool's rim reaches a little past its shore, well within the neighbours added below.
  for (const [old, now] of pairs(before.pools ?? [], after.pools ?? [])) {
    if (!changed(old, now)) continue;
    for (const pool of [old, now]) if (pool) for (const [tx, tz] of tilesTouched(pool.region)) tiles.add(key(tx, tz));
  }

  for (const k of [...tiles]) {
    const [tx, tz] = k.split(",").map(Number);
    addAround(tiles, tx, tz, 1);
  }
  return tiles;
}

// Features matched by id: [before, after], with null for one that was added or removed.
function pairs(before, after) {
  const ids = new Set([...before, ...after].map((f) => f.id));
  return [...ids].map((id) => [before.find((f) => f.id === id) ?? null, after.find((f) => f.id === id) ?? null]);
}

// polygon-clipping repeats each ring's first corner at the end.
function openRings(region) {
  return region.map((polygon) => polygon.map((ring) => ring.slice(0, -1)));
}

function addAround(tiles, tx, tz, reach) {
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) tiles.add(key(tx + dx, tz + dz));
  }
}

// Every tile within `reach` tiles of a point.
function addNearPoint(tiles, [x, z], reach) {
  for (let tx = Math.floor(x - reach); tx <= Math.floor(x + reach); tx++) {
    for (let tz = Math.floor(z - reach); tz <= Math.floor(z + reach); tz++) {
      const dx = Math.max(tx - x, 0, x - (tx + 1));
      const dz = Math.max(tz - z, 0, z - (tz + 1));
      if (Math.hypot(dx, dz) < reach) tiles.add(key(tx, tz));
    }
  }
}

// Every tile within `reach` tiles of a polyline, found by walking it in short steps.
function addNearLine(tiles, points, reach) {
  const step = Math.max(0.05, reach / 2);
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k <= n; k++) addNearPoint(tiles, [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n], reach + step);
  }
}
