// Everything the painter draws, in feet: pure data, so it's testable and the
// same map always builds the same scene. Decorations are placements of a
// style's sprite variants: {x, y, radius, variant}.
import {cellAt, cellCenter, cellPoint, mapSize, neighbor} from "./hexGrid";
import {hash01, pointHash01} from "./random";
import {terrainAt} from "./format";
import {insetLoop, regionLoops, smoothLoop} from "./regions";
import {GLADE} from "./style";

// The forest's dark mass only shows in the gaps between crowns, so it's
// smoothed gently (sharp wiggles turn into spikes when inset) and sits this
// far inside its cells, in cell sizes, so it doesn't poke out past them.
const FOREST_INSET = 0.25;
const FOREST_SMOOTHING = {irregularity: 0.2, roughness: 0};

// Cells this far past the grid still get decorations, so its ragged edge
// (which the map's rectangle reaches past) isn't bare.
const DECORATION_PAD = 1;

// Ground that's painted as its own region over the meadow, in this order.
const GROUND_REGIONS = ["tallGrass", "marsh"];

// Trails clear trees this far past their edge (in cell sizes): cells that
// near count as open ground for the forest's band, so crowns line them.
const TRAIL_CLEARANCE = 0.4;

// Crowns fill a band along the forest's edge, one entry per cell of depth
// (the chance a cell that deep gets a crown); deeper in, the dark mass shows.
const BAND = [1, 0.85, 0.6];

export function buildScene(map, style = GLADE) {
  const {cellSize} = map.grid;
  const {seed} = map;
  const scene = {...mapSize(map.grid), cellSize, grounds: [], trails: [], forest: [], crowns: [], patches: [], tufts: [], tallTufts: [], pools: [], reeds: []};

  scene.grounds = GROUND_REGIONS.map((terrain) => ({terrain, loops: regionLoops(map, terrain).map((loop) => smoothLoop(loop, cellSize, seed))}));
  scene.trails = fadeTrailEnds(
    (map.trails ?? []).map(({width, points}) => ({
      width: width * cellSize,
      points: throughPoints(points.map(([col, row]) => cellPoint(col, row, cellSize))),
    })),
    scene,
    seed,
  );

  const clearedCells = trailClearings(scene.trails, cellSize);
  const cleared = (col, row) => clearedCells.has(`${col},${row}`);
  // The forest's mass leaves out what trails clear, as its crowns do.
  scene.forest = regionLoops(map, "trees", cleared).map((loop) => insetLoop(smoothLoop(loop, cellSize, seed, FOREST_SMOOTHING), FOREST_INSET * cellSize));
  const depth = forestDepths(map, cleared);
  eachCell(map, (col, row, terrain) => {
    const h = (salt) => hash01(seed, col, row, salt);
    const variant = (kind, salt) => Math.floor(h(salt) * style.variants[kind]);
    const {x, y} = cellCenter(col, row, cellSize);
    if (terrain === "trees") {
      if (cleared(col, row)) return;
      const d = depth.get(`${col},${row}`);
      if (!(h(4) < BAND[d - 1])) return;
      if (d === 1) {
        // Edge crowns are pulled back from the open cells beside them, so
        // the forest ends about where its cells do.
        const pull = [0, 1, 2, 3, 4, 5]
          .filter((edge) => {
            const [nc, nr] = neighbor(col, row, edge);
            return terrainAt(map, nc, nr) !== "trees" || cleared(nc, nr);
          })
          .reduce((v, edge) => ({x: v.x - edgeDir(edge).x, y: v.y - edgeDir(edge).y}), {x: 0, y: 0});
        const l = Math.hypot(pull.x, pull.y) || 1;
        const cx = x + (h(1) - 0.5) * 0.2 * cellSize + (pull.x / l) * 0.18 * cellSize;
        const cy = y + (h(2) - 0.5) * 0.2 * cellSize + (pull.y / l) * 0.18 * cellSize;
        scene.crowns.push({x: cx, y: cy, radius: cellSize * (0.75 + 0.1 * h(3)), variant: variant("crowns", 7)});
      } else {
        scene.crowns.push({x: x + (h(1) - 0.5) * 0.5 * cellSize, y: y + (h(2) - 0.5) * 0.5 * cellSize, radius: cellSize * (0.8 + 0.25 * h(3)), variant: variant("crowns", 7)});
      }
    } else if (terrain === "meadow") {
      if (h(10) < 0.15) {
        scene.patches.push({x: x + (h(11) - 0.5) * cellSize, y: y + (h(12) - 0.5) * cellSize, radius: cellSize * (1.2 + 1.2 * h(13)), variant: variant("patches", 14)});
      }
      if (h(30) < 0.65) {
        scene.tufts.push({x: x + (h(31) - 0.5) * 0.4 * cellSize, y: y + (h(32) - 0.5) * 0.4 * cellSize, radius: cellSize * (0.4 + 0.1 * h(33)), variant: variant("tufts", 34)});
      }
    } else if (terrain === "tallGrass") {
      for (let i = 0; i < 3; i++) {
        scene.tallTufts.push({x: x + (h(40 + i * 4) - 0.5) * 0.8 * cellSize, y: y + (h(41 + i * 4) - 0.5) * 0.8 * cellSize, radius: cellSize * (0.4 + 0.15 * h(42 + i * 4)), variant: variant("tallTufts", 43 + i * 4)});
      }
    } else if (terrain === "marsh") {
      if (h(50) < 0.55) {
        scene.pools.push({x: x + (h(51) - 0.5) * 0.5 * cellSize, y: y + (h(52) - 0.5) * 0.5 * cellSize, radius: cellSize * (0.3 + 0.35 * h(53)), variant: variant("pools", 54)});
      }
      if (h(55) < 0.6) {
        scene.reeds.push({x: x + (h(56) - 0.5) * 0.7 * cellSize, y: y + (h(57) - 0.5) * 0.7 * cellSize, radius: cellSize * (0.35 + 0.1 * h(58)), variant: variant("reeds", 59)});
      }
    }
  });
  // Painted top to bottom, so lower crowns overlap the ones behind them.
  scene.crowns.sort((a, b) => a.y - b.y || a.x - b.x);
  return scene;
}

// How many cells each decorated tree cell is from open ground (1 on the
// edge), up to one past the band; deeper cells count as that. Tree cells a
// trail clears count as open.
function forestDepths(map, cleared) {
  const {cols, rows} = map.grid;
  const reach = DECORATION_PAD + BAND.length;
  const inside = (c, r) => c >= -reach && c < cols + reach && r >= -reach && r < rows + reach;
  const depth = new Map();
  let frontier = [];
  for (let c = -reach; c < cols + reach; c++) {
    for (let r = -reach; r < rows + reach; r++) {
      if (terrainAt(map, c, r) !== "trees" || cleared(c, r)) frontier.push([c, r]);
    }
  }
  for (let d = 1; d <= BAND.length && frontier.length; d++) {
    const next = [];
    for (const [c, r] of frontier) {
      for (let edge = 0; edge < 6; edge++) {
        const [nc, nr] = neighbor(c, r, edge);
        const key = `${nc},${nr}`;
        if (!inside(nc, nr) || depth.has(key) || terrainAt(map, nc, nr) !== "trees" || cleared(nc, nr)) continue;
        depth.set(key, d);
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return {get: (key) => depth.get(key) ?? BAND.length + 1};
}

function eachCell(map, fn) {
  const {cols, rows} = map.grid;
  for (let col = -DECORATION_PAD; col < cols + DECORATION_PAD; col++) {
    for (let row = -DECORATION_PAD; row < rows + DECORATION_PAD; row++) {
      fn(col, row, terrainAt(map, col, row));
    }
  }
}

// A trail's curve passes through each of its points (a Catmull-Rom spline),
// so trails that share a point meet there.
const TRAIL_STEPS = 8;

function throughPoints(points) {
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  const out = [points[0]];
  for (let i = 0; i + 1 < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 1; k <= TRAIL_STEPS; k++) {
      const t = k / TRAIL_STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y)});
    }
  }
  return out;
}

// A trail that just stops peters out: over its last few widths it spreads
// and fades, with a few patches of dirt beyond it. Ends that join another
// trail, or run off the map, don't. Each trail becomes {width, points,
// body, fades, spots, caps}: body is the part drawn solid, each fade runs
// from where the solid part stops out to the trail's end, and caps are
// the ends that don't fade.
const FADE_LENGTH = 2.5;

function fadeTrailEnds(trails, {width: mapWidth, height: mapHeight}, seed) {
  return trails.map((trail, i) => {
    const {width, points} = trail;
    const free = (p) =>
      p.x > width && p.y > width && p.x < mapWidth - width && p.y < mapHeight - width &&
      trails.every((other, j) => j === i || lineDistance(p.x, p.y, other.points) > other.width);
    const total = lineLength(points);
    const fadeAt = (p) => (free(p) ? Math.min(FADE_LENGTH * width, total / 2) : 0);
    const startFade = fadeAt(points[0]);
    const endFade = fadeAt(points[points.length - 1]);

    const [startPart, rest] = splitAt(points, startFade);
    const [body, endPart] = splitAt(rest, total - startFade - endFade);
    const fades = [];
    const spots = [];
    for (const part of [startFade && [...startPart].reverse(), endFade && endPart]) {
      if (!part || part.length < 2) continue;
      fades.push(part);
      const end = part[part.length - 1];
      const before = part[part.length - 2];
      const l = Math.hypot(end.x - before.x, end.y - before.y) || 1;
      const dir = {x: (end.x - before.x) / l, y: (end.y - before.y) / l};
      // Spots scatter wider and thin out toward the end and past it.
      for (let k = 0; k < 9; k++) {
        const h = (salt) => pointHash01(seed, end.x, end.y, 200 + k * 4 + salt);
        const t = h(0);
        const along = (t * 1.6 - 1) * FADE_LENGTH * 0.6 * width;
        const across = (h(1) - 0.5) * (0.6 + 1.2 * t) * width;
        spots.push({x: end.x + dir.x * along - dir.y * across, y: end.y + dir.y * along + dir.x * across, radius: width * (0.08 + 0.14 * h(2) * (1 - 0.5 * t))});
      }
    }
    // Where the solid part doesn't fade out, it gets a round end.
    const caps = [!startFade && points[0], !endFade && points[points.length - 1]].filter(Boolean);
    return {width, points, body, fades, spots, caps};
  });
}

function lineLength(points) {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return total;
}

// Splits a line at a distance along it, both halves sharing the cut.
function splitAt(points, distance) {
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + l >= distance) {
      const t = l ? (distance - walked) / l : 0;
      const cut = {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
      return [[...points.slice(0, i + 1), cut], [cut, ...points.slice(i + 1)]];
    }
    walked += l;
  }
  return [points, [points[points.length - 1]]];
}

function lineDistance(x, y, points) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) best = Math.min(best, segmentDistance(x, y, points[i], points[i + 1]));
  return best;
}

// The cells whose centers are within a trail's clearance: each segment
// checks only the cells around it.
function trailClearings(trails, cellSize) {
  const cleared = new Set();
  for (const {width, points} of trails) {
    const reach = width / 2 + TRAIL_CLEARANCE * cellSize;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const b = points[i + 1];
      const [c0, r0] = cellAt(Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, cellSize);
      const [c1, r1] = cellAt(Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach, cellSize);
      for (let col = c0 - 1; col <= c1 + 1; col++) {
        for (let row = r0 - 1; row <= r1 + 1; row++) {
          const {x, y} = cellCenter(col, row, cellSize);
          if (segmentDistance(x, y, a, b) < reach) cleared.add(`${col},${row}`);
        }
      }
    }
  }
  return cleared;
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

// The unit direction from a cell's center across edge i.
function edgeDir(edge) {
  const a = (Math.PI / 6) * (2 * edge + 1);
  return {x: Math.cos(a), y: Math.sin(a)};
}
