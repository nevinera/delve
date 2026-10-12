// Everything the painter draws, in feet: pure data, so it's testable and the
// same map always builds the same scene. Decorations are placements of a
// style's sprite variants: {x, y, radius, variant}.
import {CELL_SIZE, cellAt, cellCenter, cellPoint, mapSize, neighbor} from "./hexGrid";
import {hash01, pointHash01} from "./random";
import {terrainAt} from "./format";
import {insetLoop, noise, regionLoops, smoothLoop, softLoop, warp} from "./regions";
import {DEFAULT_PATH, PATHS, resolveStyle} from "./style";
import {bridgeDeck} from "./bridges";

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

// Shores are smooth curves. Water is darker in cells with water all
// around, and this far in from them, in cell sizes.
const DEEP_INSET = 0.3;

// How far apart, in feet, a marsh's wetter and drier stretches are.
const HUMMOCK_SPREAD = 18;

// The ground each cell is drawn on: water's edge cells take the ground
// beside them (the most of it, among their neighbors), so whatever's on
// the shore runs right under the water's curve, with no stripe of meadow
// between them.
function shoreGround(map) {
  const grounds = new Set(GROUND_REGIONS);
  return (c, r) => {
    const terrain = terrainAt(map, c, r);
    if (terrain !== "water") return terrain;
    const counts = {};
    for (let edge = 0; edge < 6; edge++) {
      const t = terrainAt(map, ...neighbor(c, r, edge));
      if (t !== "water" && t !== "trees") counts[t] = (counts[t] ?? 0) + 1;
    }
    const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return best && grounds.has(best[0]) ? best[0] : terrain;
  };
}

// A marsh's edge wanders a long way from its cells', so a block of marsh
// doesn't look like one: in and out by up to MARSH_WANDER feet, over about
// MARSH_WAVELENGTH. Its water sits back from that edge by about
// MARSH_BANK, more or less.
const MARSH_WANDER = 2.5;
const MARSH_WAVELENGTH = 9;
const MARSH_BANK = 1.6;

// Crowns fill a band along the forest's edge, one entry per cell of depth
// (the chance a cell that deep gets a crown; see the style's forest.band);
// deeper in, the dark mass shows. Rock is hatched along its edge instead,
// this thickly.
const HATCH_BAND = [1, 0.45];

// Ice along winter water's edge: this far in from it on average, in cell
// sizes, and this jagged.
const ICE_DEPTH = 0.4;
const ICE_JAGGED = 0.8;

// The trails as drawn: curves in feet, their free ends fading out.
function sceneTrails(map, size) {
  return fadeTrailEnds(
    (map.trails ?? []).map(({type = DEFAULT_PATH, width, points}) => ({
      type,
      width: width * CELL_SIZE,
      points: throughPoints(points.map(([col, row]) => cellPoint(col, row, CELL_SIZE))).map((p) => edgeWarp(p, size, map.seed)),
    })),
    size,
    map.seed,
  );
}

// Trails bend as the map's edges do (see regions.js's warp), less so
// near the map's edge, so one that runs to it still does.
const EDGE_HOLD = 5; // feet

function edgeWarp(p, {width, height}, seed) {
  const w = warp(p, seed);
  const hold = Math.max(0, Math.min(1, Math.min(p.x, p.y, width - p.x, height - p.y) / EDGE_HOLD));
  return {x: p.x + (w.x - p.x) * hold, y: p.y + (w.y - p.y) * hold};
}

export function buildScene(map, style = resolveStyle(map)) {
  const cellSize = CELL_SIZE;
  const {seed} = map;
  const scene = {...mapSize(map.grid), cellSize, grounds: [], marshWater: [], water: [], deepWater: [], ice: [], bridges: [], trails: [], forest: [], crowns: [], hatches: [], patches: [], tufts: [], tallTufts: [], hummocks: [], reeds: []};
  const rock = style.forest.mass === "rock";

  const under = shoreGround(map);
  scene.grounds = GROUND_REGIONS.map((terrain) => ({terrain, loops: regionLoops(map, terrain, undefined, under).map((loop) => (terrain === "marsh" ? marshEdge(loop, seed) : smoothLoop(loop, cellSize, seed)))}));
  scene.marshWater = scene.grounds.find(({terrain}) => terrain === "marsh").loops.map((loop) => marshWaterEdge(loop, seed));
  scene.water = regionLoops(map, "water").map((loop) => softLoop(loop, cellSize, seed));
  const shallow = (c, r) => [0, 1, 2, 3, 4, 5].some((edge) => terrainAt(map, ...neighbor(c, r, edge)) !== "water");
  scene.deepWater = regionLoops(map, "water", shallow).map((loop) => insetLoop(softLoop(loop, cellSize, seed), DEEP_INSET * cellSize));
  if (style.water.edge === "ice") scene.ice = scene.water.map((loop) => jaggedInset(loop, ICE_DEPTH * cellSize, ICE_JAGGED, seed));
  scene.bridges = (map.bridges ?? []).map(bridgeDeck);
  scene.trails = sceneTrails(map, scene);
  // Trails run on open ground only, and clear no trees. Rock is rough, and
  // comes right to its cells' edge.
  scene.forest = regionLoops(map, "trees").map((loop) => (rock ? smoothLoop(loop, cellSize, seed) : insetLoop(smoothLoop(loop, cellSize, seed, FOREST_SMOOTHING), FOREST_INSET * cellSize)));
  const band = rock ? HATCH_BAND : style.forest.band;
  const depth = forestDepths(map, band.length);
  eachCell(map, (col, row, terrain) => {
    const h = (salt) => hash01(seed, col, row, salt);
    const variant = (kind, salt) => Math.floor(h(salt) * style.variants[kind]);
    const {x, y} = cellCenter(col, row, cellSize);
    if (terrain === "trees") {
      const d = depth.get(`${col},${row}`);
      if (!(h(4) < band[d - 1])) return;
      if (rock) {
        for (let i = 0; i < 2; i++) {
          scene.hatches.push({x: x + (h(60 + i * 4) - 0.5) * 0.7 * cellSize, y: y + (h(61 + i * 4) - 0.5) * 0.7 * cellSize, radius: cellSize * (0.5 + 0.2 * h(62 + i * 4)), variant: variant("hatches", 63 + i * 4)});
        }
        return;
      }
      if (!style.forest.crowns) return;
      if (d === 1) {
        // Edge crowns are pulled back from the open cells beside them, so
        // the forest ends about where its cells do.
        const pull = [0, 1, 2, 3, 4, 5]
          .filter((edge) => {
            const [nc, nr] = neighbor(col, row, edge);
            return terrainAt(map, nc, nr) !== "trees";
          })
          .reduce((v, edge) => ({x: v.x - edgeDir(edge).x, y: v.y - edgeDir(edge).y}), {x: 0, y: 0});
        const l = Math.hypot(pull.x, pull.y) || 1;
        const cx = x + (h(1) - 0.5) * 0.35 * cellSize + (pull.x / l) * 0.18 * cellSize;
        const cy = y + (h(2) - 0.5) * 0.35 * cellSize + (pull.y / l) * 0.18 * cellSize;
        scene.crowns.push({x: cx, y: cy, radius: cellSize * (0.75 + 0.1 * h(3)), variant: variant("crowns", 7)});
      } else {
        scene.crowns.push({x: x + (h(1) - 0.5) * 0.5 * cellSize, y: y + (h(2) - 0.5) * 0.5 * cellSize, radius: cellSize * (0.8 + 0.25 * h(3)), variant: variant("crowns", 7)});
      }
    } else if (terrain === "meadow") {
      if (h(10) < style.meadow.patches) {
        scene.patches.push({x: x + (h(11) - 0.5) * cellSize, y: y + (h(12) - 0.5) * cellSize, radius: cellSize * (1.2 + 1.2 * h(13)), variant: variant("patches", 14)});
      }
      if (h(30) < style.meadow.tufts) {
        scene.tufts.push({x: x + (h(31) - 0.5) * 0.4 * cellSize, y: y + (h(32) - 0.5) * 0.4 * cellSize, radius: cellSize * (0.4 + 0.1 * h(33)), variant: variant("tufts", 34)});
      }
    } else if (terrain === "tallGrass") {
      for (let i = 0; i < style.tallGrass.clumps; i++) {
        scene.tallTufts.push({x: x + (h(40 + i * 4) - 0.5) * 0.8 * cellSize, y: y + (h(41 + i * 4) - 0.5) * 0.8 * cellSize, radius: cellSize * (0.4 + 0.15 * h(42 + i * 4)), variant: variant("tallTufts", 43 + i * 4)});
      }
    } else if (terrain === "marsh") {
      // Marsh is shallow water with ground rising out of it: hummocks,
      // which merge where they touch. Some stretches are drier (more and
      // bigger hummocks) than others. By its edge, some are pushed out
      // into its bank, so the water's edge is ragged.
      const dry = noise(seed, x / HUMMOCK_SPREAD, y / HUMMOCK_SPREAD, 500);
      const count = Math.floor(style.marsh.hummocks * (0.2 + 1.6 * dry) + h(50));
      for (let i = 0; i < count; i++) {
        scene.hummocks.push({x: x + (h(51 + i * 4) - 0.5) * 0.9 * cellSize, y: y + (h(52 + i * 4) - 0.5) * 0.9 * cellSize, radius: cellSize * (0.14 + (0.15 + 0.4 * dry) * h(53 + i * 4)), variant: variant("hummocks", 54 + i * 4)});
      }
      for (const edge of [0, 1, 2, 3, 4, 5]) {
        if (terrainAt(map, ...neighbor(col, row, edge)) === "marsh" || h(70 + edge) > 0.4) continue;
        const dir = edgeDir(edge);
        const out = 0.25 + 0.25 * h(76 + edge);
        scene.hummocks.push({x: x + dir.x * out * cellSize, y: y + dir.y * out * cellSize, radius: cellSize * (0.25 + 0.3 * h(82 + edge)), variant: variant("hummocks", 88 + edge)});
      }
      if (h(55) < style.marsh.reeds) {
        scene.reeds.push({x: x + (h(56) - 0.5) * 0.7 * cellSize, y: y + (h(57) - 0.5) * 0.7 * cellSize, radius: cellSize * (0.35 + 0.1 * h(58)), variant: variant("reeds", 59)});
      }
    }
  });
  // Decorations drift with the edges they line (see regions.js's warp).
  for (const kind of ["crowns", "hatches", "patches", "tufts", "tallTufts", "hummocks", "reeds"]) {
    scene[kind] = scene[kind].map((p) => ({...p, ...warp(p, seed)}));
  }
  // Nothing grows on a trail: ground decorations that would overlap one
  // are left out. Only placements in cells near a trail need checking.
  const nearCells = trailClearings(scene.trails, cellSize, 1);
  const offTrail = (p) => {
    if (!nearCells.has(cellAt(p.x, p.y, cellSize).join(","))) return true;
    return scene.trails.every((t) => lineDistance(p.x, p.y, t.points) > t.width / 2 + p.radius * 0.6);
  };
  for (const kind of ["tufts", "tallTufts", "reeds"]) scene[kind] = scene[kind].filter(offTrail);
  // Nor on a bridge, and no tree hangs over one.
  const offBridges = (p) => scene.bridges.every(({a, b, halfWidth}) => segmentDistance(p.x, p.y, a, b) > halfWidth + p.radius * 0.5);
  for (const kind of ["tufts", "tallTufts", "reeds", "crowns"]) scene[kind] = scene[kind].filter(offBridges);

  // Painted top to bottom, so lower crowns overlap the ones behind them.
  scene.crowns.sort((a, b) => a.y - b.y || a.x - b.x);
  return scene;
}

// How many cells each decorated tree cell is from open ground (1 on the
// edge), up to one past the band (bandLength cells deep); deeper cells
// count as that.
function forestDepths(map, bandLength) {
  const {cols, rows} = map.grid;
  const reach = DECORATION_PAD + bandLength;
  const inside = (c, r) => c >= -reach && c < cols + reach && r >= -reach && r < rows + reach;
  const depth = new Map();
  let frontier = [];
  for (let c = -reach; c < cols + reach; c++) {
    for (let r = -reach; r < rows + reach; r++) {
      if (terrainAt(map, c, r) !== "trees") frontier.push([c, r]);
    }
  }
  for (let d = 1; d <= bandLength && frontier.length; d++) {
    const next = [];
    for (const [c, r] of frontier) {
      for (let edge = 0; edge < 6; edge++) {
        const [nc, nr] = neighbor(c, r, edge);
        const key = `${nc},${nr}`;
        if (!inside(nc, nr) || depth.has(key) || terrainAt(map, nc, nr) !== "trees") continue;
        depth.set(key, d);
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return {get: (key) => depth.get(key) ?? bandLength + 1};
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
// the ends that don't fade. How long a fade is, in widths, is the path
// type's (see style.js's PATHS).

function fadeTrailEnds(trails, {width: mapWidth, height: mapHeight}, seed) {
  return trails.map((trail, i) => {
    const {type, width, points} = trail;
    const fadeLength = (PATHS[type] ?? PATHS[DEFAULT_PATH]).fade;
    const free = (p) =>
      p.x > width && p.y > width && p.x < mapWidth - width && p.y < mapHeight - width &&
      trails.every((other, j) => j === i || lineDistance(p.x, p.y, other.points) > other.width);
    const total = lineLength(points);
    const fadeAt = (p) => (free(p) ? Math.min(fadeLength * width, total / 2) : 0);
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
        const along = (t * 1.6 - 1) * fadeLength * 0.6 * width;
        const across = (h(1) - 0.5) * (0.6 + 1.2 * t) * width;
        spots.push({x: end.x + dir.x * along - dir.y * across, y: end.y + dir.y * along + dir.x * across, radius: width * (0.08 + 0.14 * h(2) * (1 - 0.5 * t))});
      }
    }
    // Where the solid part doesn't fade out, it gets a round end.
    const caps = [!startFade && points[0], !endFade && points[points.length - 1]].filter(Boolean);
    return {type, width, points, body, fades, spots, caps};
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

// The cells whose centers are within margin (in cell sizes) of a trail's
// edge: each segment checks only the cells around it.
function trailClearings(trails, cellSize, margin) {
  const cleared = new Set();
  for (const {width, points} of trails) {
    const reach = width / 2 + margin * cellSize;
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

// A loop moved in by about depth, more or less at each point, so its edge
// is jagged (see insetLoop). Small loops get a thinner edge.
function jaggedInset(loop, depth, jagged, seed) {
  const n = loop.length;
  const thin = Math.min(1, loopSize(loop) / (depth * 12));
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    // Every third point juts out, by a hashed amount, so the edge is teeth.
    const tooth = i % 3 === 0 ? pointHash01(seed, Math.round(p.x * 10), Math.round(p.y * 10), 300) : -0.5;
    const d = depth * thin * (1 + jagged * tooth);
    return {x: p.x - (dy / l) * d, y: p.y + (dx / l) * d};
  });
}

function marshEdge(loop, seed) {
  return wander(softLoop(loop, CELL_SIZE, seed, {passes: 2, wobble: 0.45}), MARSH_WANDER, seed, 510);
}

// Small marshes get a thinner bank, so they still have water.
function marshWaterEdge(edge, seed) {
  const bank = MARSH_BANK * Math.min(1, loopSize(edge) / (MARSH_BANK * 8));
  return wander(insetLoop(edge, bank), bank * 0.8, seed, 520);
}

// Each point of a loop moved in or out (along the loop's normal) by up
// to amount, by noise over where it is.
function wander(loop, amount, seed, salt) {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = (noise(seed, p.x / MARSH_WAVELENGTH, p.y / MARSH_WAVELENGTH, salt) - 0.5) * 2 * amount;
    return {x: p.x - ((b.y - a.y) / l) * d, y: p.y + ((b.x - a.x) / l) * d};
  });
}

// About how wide a loop is: the side of a square of its area.
function loopSize(loop) {
  const n = loop.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += loop[i].x * loop[(i + 1) % n].y - loop[(i + 1) % n].x * loop[i].y;
  return Math.sqrt(Math.abs(area) / 2);
}

// The unit direction from a cell's center across edge i.
function edgeDir(edge) {
  const a = (Math.PI / 6) * (2 * edge + 1);
  return {x: Math.cos(a), y: Math.sin(a)};
}
