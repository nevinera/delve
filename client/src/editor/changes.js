import { TILE_FT } from "../world/constants.js";
import { PER_TILE, changedPoints } from "../world/landGrid.js";
import { riverReachFt, roadReachFt } from "../world/generator.js";
import { RIVER_PULL_FT } from "../world/biomes.js";
import { tilesTouched } from "./region.js";
import { fillLake } from "../world/lakes.js";
import { waterGround } from "../world/waterGround.js";

// Which tiles an edit changes, so the editor can highlight them and regenerate just those. Each
// kind of change reaches as far as the generator lets it: a changed land height reshapes the
// ground a grid point either side of it, and a river carves along its whole length, as does a
// road. Info pins and hubs don't touch the ground yet. Every hit tile brings its neighbours along.
//
// Biome borders can move anywhere a biome pin's region reaches, so any biome pin change marks
// every tile with land. Rivers bend biome borders only within RIVER_PULL_FT of themselves, so a
// changed river marks the tiles that near it.

const key = (tx, tz) => `${tx},${tz}`;

// Tile keys ("x,z") that differ between two versions of a continent, each { land, pins, paths,
// water, edited } with land a LandGrid (landGrid.js), the sketch's pins, paths and water, and the
// hand-shaped tiles' heights (generator.js prepareWorld).
// `tiles` is every tile with land, after the edit.
export function changedTiles(before, after, tiles) {
  const out = new Set();
  const changed = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  const pinsOf = (c, kind) => c.pins.filter((p) => p.kind === kind);
  const rivers = (c) => c.water?.rivers ?? [];

  const hasBiomes = [...before.pins, ...after.pins].some((p) => p.kind === "biome");
  if (changed(pinsOf(before, "biome"), pinsOf(after, "biome"))) for (const k of tiles) out.add(k);

  // A point shapes the ground out to the next point either way.
  for (const [gx, gz] of changedPoints(before.land, after.land)) {
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) out.add(key(Math.floor((gx + dx) / PER_TILE), Math.floor((gz + dz) / PER_TILE)));
  }

  for (const river of unmatched(rivers(before), rivers(after))) {
    addNearLine(out, river.points, Math.max(riverReachFt(river.width), hasBiomes ? RIVER_PULL_FT : 0) / TILE_FT);
  }

  // A road's tiles, where its route, width or tags changed: the old ones and the new.
  const roads = (c) => (c.paths ?? []).filter((p) => p.route?.points).map((p) => ({ points: p.route.points, width: p.width, tags: p.tags }));
  for (const road of unmatched(roads(before), roads(after))) addNearLine(out, road.points, roadReachFt(road.width) / TILE_FT);

  // A lake's shape follows the land, so any lake whose shape changed, from the land or its own
  // seed and level. Its rim reaches a little past its shore, well within the neighbours added below.
  const lakes = (c) => new Map((c.water?.lakes ?? []).map((lake) => [lake.id, lake]));
  const [was, now] = [lakes(before), lakes(after)];
  const shape = (c, lake) => (lake ? fillLake(waterGround((x, z) => c.land.heightAt(x, z), c.edited), lake).region : []);
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const [a, b] = [shape(before, was.get(id)), shape(after, now.get(id))];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    for (const region of [a, b]) for (const [tx, tz] of tilesTouched(region)) out.add(key(tx, tz));
  }

  for (const k of [...out]) {
    const [tx, tz] = k.split(",").map(Number);
    addAround(out, tx, tz, 1);
  }
  return out;
}

// The things in only one of the two lists, compared whole.
function unmatched(before, after) {
  const text = (list) => new Set(list.map((f) => JSON.stringify(f)));
  const [a, b] = [text(before), text(after)];
  return [...before.filter((f) => !b.has(JSON.stringify(f))), ...after.filter((f) => !a.has(JSON.stringify(f)))];
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
