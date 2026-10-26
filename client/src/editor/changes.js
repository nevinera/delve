import polygonClipping from "polygon-clipping";
import { TILE_FT } from "../world/constants.js";
import { EDGE_REACH_FT, riverReachFt, roadReachFt } from "../world/generator.js";
import { RIVER_PULL_FT } from "../world/biomes.js";
import { tilesTouched } from "./region.js";

// Which tiles an edit changes, so the editor can highlight them and regenerate just those. Each
// kind of change reaches as far as the generator lets it: a moved coast reshapes the shore around
// it, and a river carves along its whole length, as does a road. Info pins and hubs don't touch
// the ground yet. Every hit tile brings its neighbours along.
//
// Height pins and cliffs shape one surface across the continent, so a height pin or cliff change
// marks every zoned tile. Biome borders can move anywhere a biome pin's region reaches, and zone edges bend
// them, so when there are biome pins, any biome pin or region change does too. Rivers bend biome
// borders only within RIVER_PULL_FT of themselves, so a changed river marks the tiles that near
// it.

const key = (tx, tz) => `${tx},${tz}`;

// Tile keys ("x,z") that differ between two versions of a continent, each { zones, pins, cliffs,
// paths, watercourses } with zones as stored ({ region }) and the sketch's pins and watercourses.
export function changedTiles(before, after) {
  const tiles = new Set();
  const changed = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  const regions = (c) => c.zones.map((z) => z.region).filter((r) => r.length);
  const pinsOf = (c, kind) => c.pins.filter((p) => p.kind === kind);
  const rivers = (c) => c.watercourses?.rivers ?? [];

  const hasBiomes = [...before.pins, ...after.pins].some((p) => p.kind === "biome");
  const regionsMoved = changed(regions(before), regions(after));
  const biomesMoved = hasBiomes && (changed(pinsOf(before, "biome"), pinsOf(after, "biome")) || regionsMoved);
  const cliffs = (c) => (c.cliffs ?? []).map((cliff) => cliff.points);
  if (biomesMoved || changed(pinsOf(before, "height"), pinsOf(after, "height")) || changed(cliffs(before), cliffs(after))) {
    for (const region of [...regions(before), ...regions(after)]) for (const [tx, tz] of tilesTouched(region)) addAround(tiles, tx, tz, 1);
  }

  if (regionsMoved) {
    const [a, b] = [regions(before), regions(after)];
    const moved = !a.length ? b.flat() : !b.length ? a.flat() : openRings(polygonClipping.xor(polygonClipping.union(...a), polygonClipping.union(...b)));
    const reach = Math.ceil(EDGE_REACH_FT / TILE_FT);
    for (const [tx, tz] of tilesTouched(moved)) addAround(tiles, tx, tz, reach);
  }

  for (const river of unmatched(rivers(before), rivers(after))) {
    addNearLine(tiles, river.points, Math.max(riverReachFt(river.width), hasBiomes ? RIVER_PULL_FT : 0) / TILE_FT);
  }

  // A road's tiles, where its route, width or tags changed: the old ones and the new.
  const roads = (c) => (c.paths ?? []).filter((p) => p.route?.points).map((p) => ({ points: p.route.points, width: p.width, tags: p.tags }));
  for (const road of unmatched(roads(before), roads(after))) addNearLine(tiles, road.points, roadReachFt(road.width) / TILE_FT);

  // A pool's rim reaches a little past its shore, well within the neighbours added below.
  const pools = (c) => c.watercourses?.pools ?? [];
  for (const pool of unmatched(pools(before), pools(after))) for (const [tx, tz] of tilesTouched(pool.region)) tiles.add(key(tx, tz));

  for (const k of [...tiles]) {
    const [tx, tz] = k.split(",").map(Number);
    addAround(tiles, tx, tz, 1);
  }
  return tiles;
}

// The things in only one of the two lists, compared whole.
function unmatched(before, after) {
  const text = (list) => new Set(list.map((f) => JSON.stringify(f)));
  const [a, b] = [text(before), text(after)];
  return [...before.filter((f) => !b.has(JSON.stringify(f))), ...after.filter((f) => !a.has(JSON.stringify(f)))];
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
