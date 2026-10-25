import polygonClipping from "polygon-clipping";
import { TILE_FT } from "../world/constants.js";
import { EDGE_REACH_FT, PIN_REACH_FT, riverReachFt } from "../world/generator.js";
import { tilesTouched } from "./region.js";

// Which tiles a sketch edit changes, so the editor can highlight them and regenerate just those.
// Each kind of change reaches as far as the generator lets it: a moved region edge reshapes the
// shore around it, a height pin shapes the ground within its reach, and a river carves along its
// whole length. Info pins don't touch the ground. Every hit tile brings its neighbours along.

const key = (tx, tz) => `${tx},${tz}`;

// Tile keys ("x,z") that differ between two versions of a zone. Either may be null for a zone
// that was just made or removed.
export function changedTiles(before, after) {
  const tiles = new Set();
  const empty = { region: [], pins: [], strokes: [] };
  const a = before ?? empty;
  const b = after ?? empty;

  if (JSON.stringify(a.region) !== JSON.stringify(b.region)) {
    const moved = !a.region.length
      ? b.region
      : !b.region.length
        ? a.region
        : openRings(polygonClipping.xor(a.region, b.region));
    const reach = Math.ceil(EDGE_REACH_FT / TILE_FT);
    for (const [tx, tz] of tilesTouched(moved)) addAround(tiles, tx, tz, reach);
  }

  for (const [old, now] of pairs(a.pins, b.pins)) {
    if (JSON.stringify(old) === JSON.stringify(now)) continue;
    for (const pin of [old, now]) {
      if (pin?.kind === "height") addNearPoint(tiles, pin.at, PIN_REACH_FT / TILE_FT);
    }
  }

  for (const [old, now] of pairs(a.strokes, b.strokes)) {
    if (JSON.stringify(old) === JSON.stringify(now)) continue;
    for (const stroke of [old, now]) {
      if (stroke?.kind === "river") addNearLine(tiles, stroke.points, riverReachFt(stroke.width ?? 30) / TILE_FT);
    }
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
