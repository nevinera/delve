// Generates a cell map, after watabou's cave/glade generator (see
// https://boristhebrave.com/2023/11/19/how-does-cave-glade-generator-work):
// areas grown from seed cells through the trees (the theme's fill), linked
// by doors, some thinned to corridors, with exits cut through to the map's
// edge. Pure, and the same for the same options, so it runs anywhere (see
// bin/cellmap-generate).
//
// Tags steer it:
//   chamber   areas all about the same size
//   hub       one big area in the middle, small ones around it
//   burrow    big rooms, sometimes very big, and many thinned to corridors
//   cavities  round areas
//   coral     narrow, branching areas
//   chaotic   twisty, stringy areas
//   tight     areas packed close together
//   tree      no loops: one way between any two areas
//   connected every pair of touching areas linked (normally, of three that
//             all touch, one pair isn't)
//   dry       no marsh
//   wet       marsh is the main ground, not meadow
//   rough     tall grass is the main ground
//   paths     trails joining the exits, as a tree (or, with one exit, from
//             it into the map)
//
// Besides the main ground, some areas are tall grass or marsh throughout,
// and patches of them are sprinkled about (by noise, as watabou does his
// water).
import {CELL_SIZE, cellCenter, hexDistance, neighbor, pointAt} from "./hexGrid";
import {SIDES, exitEdge, sideCell, sideLength} from "./exits";
import {THEMES, VERSION, fillOf} from "./format";
import {noise} from "./regions";
import {PATHS} from "./style";

export const TAGS = ["chamber", "hub", "burrow", "cavities", "coral", "chaotic", "tight", "tree", "connected", "dry", "wet", "rough", "paths"];

// Which tags can't go together (the first of a group given wins).
const EXCLUSIVE = [["chamber", "hub", "burrow"], ["cavities", "coral", "chaotic"], ["wet", "rough"], ["wet", "dry"]];

// Trees between areas, in cells: areas never come nearer each other than
// this (so there's forest between them) or the map's edge.
const GAP = 4;
const MARGIN = 3;

// How much of the map (inside the margin) areas cover.
const COVER = 0.3;
const TIGHT_COVER = 0.38;

// How many free cells a new area's start is picked from (see pickSeed).
const SEED_PICKS = 8;

// Doors, corridors and exits are cut this many cells either side of
// their middle line, so they're wide enough to walk through.
const CUT_RADIUS = 1;

// Letters for the grounds (see themes.json).
const GROUND = {meadow: ".", tallGrass: "%", marsh: "~"};

// The chance an area is one other ground throughout, and how much of the
// rest is sprinkled with each (noise this far apart, in cells).
const WHOLE_AREA = 0.22;
const SPRINKLE = {marsh: 0.74, tallGrass: 0.72, meadow: 0.68};
const SPRINKLE_WAVELENGTH = 5;

// Returns a cellMap (see docs/schema/map.md#cellmap). Unknown tags throw;
// of exclusive ones, the first given wins.
export function generateCellMap({cols, rows, seed = 1, connections = 0, tags = [], theme = "glade"}) {
  const unknown = tags.filter((t) => !TAGS.includes(t));
  if (unknown.length) throw new Error(`unknown tags: ${unknown.join(", ")} (known: ${TAGS.join(", ")})`);
  if (!THEMES[theme]) throw new Error(`unknown theme: ${theme}`);
  if (!(Number.isInteger(connections) && connections >= 0 && connections <= SIDES.length)) throw new Error(`connections must be 0 to ${SIDES.length}`);
  const has = tagSet(tags);
  const rng = random(seed);
  const grid = new Grid(cols, rows);

  const areas = growAreas(grid, has, rng);
  const links = pickLinks(grid, areas, has, rng);
  const doors = areas.map(() => []);
  for (const [a, b] of links) {
    const path = grid.carve(areas[a].cells, areas[b].cells, rng);
    if (!path) continue;
    doors[a].push(path[0]);
    doors[b].push(path[path.length - 1]);
  }
  const exits = cutExits(grid, areas, doors, connections, rng);
  thinToCorridors(grid, areas, doors, has, rng);
  grid.joinAll(rng);
  grid.smooth();

  const fill = fillOf(theme);
  const ground = grounds(grid, areas, has, seed, rng);
  const cells = Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => (grid.isOpen(c, r) ? GROUND[ground(grid.key(c, r), c, r)] : fill)).join(""));
  const trails = has.has("paths") ? pathTrails(grid, exits, theme, rng) : [];
  return {version: VERSION, theme, grid: {type: "hex", cols, rows}, seed, cells, ...(trails.length ? {trails} : {}), ...(exits.length ? {exits} : {})};
}

function tagSet(tags) {
  const set = new Set(tags);
  for (const group of EXCLUSIVE) {
    const first = tags.find((t) => group.includes(t));
    for (const t of group) if (t !== first) set.delete(t);
  }
  return set;
}

// A seeded random number generator (mulberry32): rng() is a float in
// [0, 1).
function random(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.pick = (list) => list[Math.floor(rng() * list.length)];
  rng.shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return rng;
}

// The cells, open or not, with the searches the generator needs. Cells are
// keys, c + r * cols.
class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.open = new Uint8Array(cols * rows);
  }

  key(c, r) {
    return c + r * this.cols;
  }

  at(key) {
    return [key % this.cols, Math.floor(key / this.cols)];
  }

  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  isOpen(c, r) {
    return this.inside(c, r) && this.open[this.key(c, r)] === 1;
  }

  neighbors(key) {
    const [c, r] = this.at(key);
    const out = [];
    for (let edge = 0; edge < 6; edge++) {
      const [nc, nr] = neighbor(c, r, edge);
      if (this.inside(nc, nr)) out.push(this.key(nc, nr));
    }
    return out;
  }

  // Cells within radius steps of key.
  ball(key, radius) {
    const seen = new Set([key]);
    let frontier = [key];
    for (let d = 0; d < radius; d++) {
      frontier = frontier.flatMap((k) => this.neighbors(k)).filter((k) => !seen.has(k) && seen.add(k));
    }
    return [...seen];
  }

  // Steps from the map's edge.
  edgeDistance(key) {
    const [c, r] = this.at(key);
    return Math.min(c, r, this.cols - 1 - c, this.rows - 1 - r);
  }

  // Opens keys and the cells within radius of them, but not edge cells
  // unless edge, so open ground only reaches the edge at exits.
  openCells(keys, radius = CUT_RADIUS, {edge = false} = {}) {
    for (const k of keys) for (const b of this.ball(k, radius)) if (edge || this.edgeDistance(b) >= 1) this.open[b] = 1;
  }

  // The shortest way from any of from to any of to (keys), wandering a
  // little so cuts aren't ruler-straight, or null. Each cell costs
  // weight(key): by default open cells cost less, so cuts reuse the ground
  // there is.
  path(from, to, rng, {through = () => true, weight: base = (k) => (this.open[k] ? 0.3 : 1)} = {}) {
    const goal = new Set(to);
    const cost = new Map();
    const back = new Map();
    const jitter = new Map();
    const weight = (k) => base(k) + (jitter.get(k) ?? jitter.set(k, rng() * 0.6).get(k));
    // A simple binary heap of [cost, key].
    const heap = [];
    const push = (item) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const [l, r] = [2 * i + 1, 2 * i + 2];
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    for (const k of from) {
      cost.set(k, 0);
      push([0, k]);
    }
    while (heap.length) {
      const [d, k] = pop();
      if (d > cost.get(k)) continue;
      if (goal.has(k)) {
        const path = [k];
        while (back.has(path[0])) path.unshift(back.get(path[0]));
        return path;
      }
      for (const n of this.neighbors(k)) {
        if (!through(n) && !goal.has(n)) continue;
        const nd = d + weight(n);
        if (nd < (cost.get(n) ?? Infinity)) {
          cost.set(n, nd);
          back.set(n, k);
          push([nd, n]);
        }
      }
    }
    return null;
  }

  // Cuts a way from one set of open cells to another; returns its cells,
  // from first to last.
  carve(from, to, rng) {
    const path = this.path(from, to, rng, {through: (k) => this.edgeDistance(k) >= 1});
    if (path) this.openCells(path);
    return path;
  }

  // The open cells in groups that join up.
  components() {
    const label = new Int32Array(this.open.length).fill(-1);
    const groups = [];
    for (let k = 0; k < this.open.length; k++) {
      if (!this.open[k] || label[k] >= 0) continue;
      const group = [k];
      label[k] = groups.length;
      for (let i = 0; i < group.length; i++) {
        for (const n of this.neighbors(group[i])) {
          if (this.open[n] && label[n] < 0) {
            label[n] = groups.length;
            group.push(n);
          }
        }
      }
      groups.push(group);
    }
    return groups;
  }

  // Cuts ways between groups of open ground until it's all one.
  joinAll(rng) {
    for (let groups = this.components(); groups.length > 1; groups = this.components()) {
      groups.sort((a, b) => b.length - a.length);
      this.carve(groups[1], groups[0], rng);
    }
  }

  // Trees nearly surrounded by open ground go: lone trees in the open,
  // and notches in an area's edge.
  smooth() {
    for (let pass = 0; pass < 2; pass++) {
      const opening = [];
      for (let k = 0; k < this.open.length; k++) {
        if (this.open[k] || this.edgeDistance(k) < 1) continue;
        if (this.neighbors(k).filter((n) => this.open[n]).length >= 5) opening.push(k);
      }
      for (const k of opening) this.open[k] = 1;
    }
  }
}

// ---- Areas ----

// Sizes in cells, scaled from watabou's for our smaller cells.
function areaSize(has, rng, base) {
  if (has.has("chamber")) return base + rng.int(-6, 6);
  if (has.has("burrow")) return rng() < 0.2 ? rng.int(140, 260) : rng.int(55, 90);
  if (has.has("hub")) return rng.int(18, 34);
  return rng.int(25, 80);
}

// How strongly growth favors cells with more of the area around them:
// high grows round, below zero grows tendrils.
function growthWeight(has) {
  if (has.has("cavities")) return (around) => around ** 6;
  if (has.has("coral")) return (around) => around ** -1.5;
  if (has.has("chaotic")) return (around) => (around === 2 ? 8 : 1);
  return (around) => around ** 2;
}

// Grows areas one at a time until they cover enough of the map. Each is
// {cells: [key]}.
function growAreas(grid, has, rng) {
  const owner = new Int32Array(grid.open.length).fill(-1);
  // Cells no area may take: too near the edge, or another area.
  const blocked = new Uint8Array(grid.open.length);
  for (let k = 0; k < blocked.length; k++) if (grid.edgeDistance(k) < MARGIN) blocked[k] = 1;
  const room = blocked.length - blocked.reduce((a, b) => a + b, 0);
  const target = room * (has.has("tight") ? TIGHT_COVER : COVER);
  const weight = growthWeight(has);
  const base = rng.int(35, 45);
  const areas = [];
  let covered = 0;
  for (let attempts = 0; covered < target && attempts < 200; attempts++) {
    const seed = pickSeed(grid, areas, blocked, has, rng);
    if (seed === null) break;
    const size = areas.length === 0 && has.has("hub") ? Math.round(room * 0.28) : areaSize(has, rng, base);
    const id = areas.length;
    const cells = grow(grid, seed, size, (k) => !blocked[k] && owner[k] < 0, weight, rng);
    if (cells.length < Math.min(size, 10)) continue;
    for (const k of cells) owner[k] = id;
    for (const k of cells) for (const b of grid.ball(k, GAP)) blocked[b] = 1;
    areas.push({cells});
    covered += cells.length;
  }
  for (const {cells} of areas) for (const k of cells) grid.open[k] = 1;
  return areas;
}

// Where the next area starts: the first (for a hub) in the middle; for
// tight, as near the others as it can be; otherwise away from them.
function pickSeed(grid, areas, blocked, has, rng) {
  const free = [];
  for (let k = 0; k < blocked.length; k++) if (!blocked[k]) free.push(k);
  if (!free.length) return null;
  if (!areas.length && has.has("hub")) {
    const middle = [Math.floor(grid.cols / 2), Math.floor(grid.rows / 2)];
    return free.reduce((best, k) => (hexDistance(grid.at(k), middle) < hexDistance(grid.at(best), middle) ? k : best));
  }
  if (has.has("tight") && areas.length) {
    // Free cells next to blocked ones are as near as an area can start.
    const near = free.filter((k) => grid.neighbors(k).some((n) => blocked[n] && grid.edgeDistance(n) >= MARGIN));
    if (near.length) return rng.pick(near);
  }
  // The farthest from the other areas of a few picks, so areas spread
  // over the map rather than clumping.
  const others = areas.flatMap(({cells}) => cells.filter((_, i) => i % 3 === 0)).map((k) => grid.at(k));
  if (!others.length) return rng.pick(free);
  let best = null;
  let bestDistance = -1;
  for (let i = 0; i < SEED_PICKS; i++) {
    const k = rng.pick(free);
    const at = grid.at(k);
    const d = Math.min(...others.map((o) => hexDistance(at, o)));
    if (d > bestDistance) [best, bestDistance] = [k, d];
  }
  return best;
}

// An area grown from seed, a cell at a time, up to size cells it may take,
// each picked with weight(cells of the area around it).
function grow(grid, seed, size, may, weight, rng) {
  if (!may(seed)) return [];
  const area = new Set([seed]);
  const frontier = new Set(grid.neighbors(seed).filter(may));
  while (area.size < size && frontier.size) {
    const options = [...frontier];
    const weights = options.map((k) => weight(grid.neighbors(k).filter((n) => area.has(n)).length));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = options[options.length - 1];
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        pick = options[i];
        break;
      }
    }
    area.add(pick);
    frontier.delete(pick);
    for (const n of grid.neighbors(pick)) if (!area.has(n) && may(n)) frontier.add(n);
  }
  return [...area];
}

// ---- Links ----

// Pairs of areas to cut doors between: those that touch (only the gap's
// trees between them), less one pair of every three that all touch unless
// connected, cut to a tree for tree. Areas left out are joined later, by
// the shortest way.
function pickLinks(grid, areas, has, rng) {
  const owner = new Map();
  areas.forEach(({cells}, i) => cells.forEach((k) => owner.set(k, i)));
  const touching = new Set();
  areas.forEach(({cells}, i) => {
    for (const k of cells) {
      for (const b of grid.ball(k, GAP + 1)) {
        const j = owner.get(b);
        if (j !== undefined && j > i) touching.add(`${i},${j}`);
      }
    }
  });
  let links = rng.shuffle([...touching].map((pair) => pair.split(",").map(Number)));
  const linked = (a, b, set) => set.has(`${Math.min(a, b)},${Math.max(a, b)}`);
  if (!has.has("connected")) {
    const kept = new Set(links.map(([a, b]) => `${a},${b}`));
    for (const [a, b] of links) {
      if (!kept.has(`${a},${b}`)) continue;
      const third = areas.findIndex((_, c) => c !== a && c !== b && linked(a, c, kept) && linked(b, c, kept));
      if (third >= 0) kept.delete(`${a},${b}`);
    }
    links = links.filter(([a, b]) => kept.has(`${a},${b}`));
  }
  if (has.has("tree")) {
    const root = areas.map((_, i) => i);
    const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
    links = links.filter(([a, b]) => {
      const [ra, rb] = [find(a), find(b)];
      if (ra === rb) return false;
      root[ra] = rb;
      return true;
    });
  }
  return links;
}

// ---- Exits ----

// One exit on each of `count` different sides, cut from the open ground
// nearest a spot near that side's middle out to the edge. Returns the
// exits, as the cellMap stores them.
function cutExits(grid, areas, doors, count, rng) {
  const open = [];
  for (let k = 0; k < grid.open.length; k++) if (grid.open[k]) open.push(k);
  if (!open.length) return [];
  const owner = new Map();
  areas.forEach(({cells}, i) => cells.forEach((k) => owner.set(k, i)));
  const exits = [];
  for (const side of rng.shuffle(SIDES).slice(0, count)) {
    const length = sideLength(side, grid);
    const spot = Math.round(length * (0.3 + 0.4 * rng()));
    const edge = grid.key(...sideCell(side, Math.max(1, Math.min(length - 2, spot)), grid));
    const path = grid.path([edge], open, rng);
    if (!path) continue;
    grid.openCells(path, CUT_RADIUS, {edge: true});
    const end = owner.get(path[path.length - 1]);
    if (end !== undefined) doors[end].push(path[path.length - 1]);
    // The run of open cells along the side through where it reaches it.
    const isOpen = (i) => i >= 0 && i < length && grid.open[grid.key(...sideCell(side, i, grid))];
    const at = Math.max(1, Math.min(length - 2, spot));
    let [from, to] = [at, at];
    while (isOpen(from - 1)) from--;
    while (isOpen(to + 1)) to++;
    exits.push({side, from, to});
  }
  return SIDES.flatMap((side) => exits.filter((e) => e.side === side));
}

// ---- Corridors ----

// Some areas with two or more doors shrink to the ways between their
// doors.
function thinToCorridors(grid, areas, doors, has, rng) {
  const chance = has.has("burrow") ? 0.45 : has.has("hub") ? 0.1 : 0.18;
  areas.forEach(({cells}, i) => {
    if (doors[i].length < 2 || (i === 0 && has.has("hub")) || rng() >= chance) return;
    const inArea = new Set(cells);
    const keep = new Set();
    for (let j = 1; j < doors[i].length; j++) {
      const path = grid.path([doors[i][0]], [doors[i][j]], rng, {through: (k) => inArea.has(k)});
      for (const k of path ?? []) for (const b of grid.ball(k, CUT_RADIUS)) keep.add(b);
    }
    for (const k of cells) if (!keep.has(k)) grid.open[k] = 0;
    areas[i].corridor = true;
    // Door ends stay open, so the doors still meet the corridor.
    grid.openCells(doors[i], CUT_RADIUS);
  });
}

// ---- Ground ----

// The ground of each open cell, as ground(key, col, row): the main ground,
// except in areas that are one other ground throughout (not corridors),
// and where it's sprinkled with the others.
function grounds(grid, areas, has, seed, rng) {
  const main = has.has("wet") ? "marsh" : has.has("rough") ? "tallGrass" : "meadow";
  const others = ["meadow", "tallGrass", "marsh"].filter((g) => g !== main && !(g === "marsh" && has.has("dry")));
  const whole = new Map();
  for (const area of areas) {
    if (area.corridor || rng() >= WHOLE_AREA) continue;
    const g = rng.pick(others);
    for (const k of area.cells) whole.set(k, g);
  }
  return (key, c, r) => {
    if (whole.has(key)) return whole.get(key);
    for (const g of others) {
      const salt = 600 + Object.keys(GROUND).indexOf(g);
      if (noise(seed, c / SPRINKLE_WAVELENGTH, r / SPRINKLE_WAVELENGTH, salt) > SPRINKLE[g]) return g;
    }
    return main;
  };
}

// ---- Paths ----

// How far a trail's line may stray from the cells it follows, in feet.
const PATH_TOLERANCE = 3;

// Trails joining the exits: the first two by the best way through the
// open ground (keeping to its middle), then each other exit by the best
// way to the trails so far, joining them at a point they share. One exit
// gets a trail into the open ground's heart. Each starts at the map's
// edge.
function pathTrails(grid, exits, theme, rng) {
  if (!exits.length) return [];
  const depth = openDepth(grid);
  // Open cells cost more the nearer the trees, so trails keep to the middle.
  const through = (k) => grid.open[k] === 1;
  const middle = (exit) => grid.key(...sideCell(exit.side, Math.round((exit.from + exit.to) / 2), grid));
  const paths = [];
  const onTrail = new Map(); // key -> [path index, at]
  const add = (path) => {
    path.forEach((k, at) => onTrail.has(k) || onTrail.set(k, [paths.length, at]));
    paths.push(path);
  };
  const route = (from, to) => grid.path(from, to, rng, {through, weight: (k) => 1 + 3 / depth[k]});
  if (exits.length === 1) {
    let heart = 0;
    for (let k = 0; k < depth.length; k++) if (depth[k] > depth[heart]) heart = k;
    const path = route([middle(exits[0])], [heart]);
    if (path) add(path);
  } else {
    const path = route([middle(exits[0])], [middle(exits[1])]);
    if (path) add(path);
  }
  // Junctions: where a later trail meets an earlier one, the earlier one
  // keeps that point.
  const pinned = paths.map(() => new Set());
  for (const exit of exits.slice(2)) {
    if (!paths.length) break;
    const path = route([middle(exit)], [...onTrail.keys()]);
    if (!path) continue;
    const [index, at] = onTrail.get(path[path.length - 1]);
    pinned[index].add(at);
    pinned.push(new Set());
    add(path);
  }
  const type = THEMES[theme].paths[0];
  return paths.map((path, i) => {
    const points = simplify(path.map((k) => cellCenter(...grid.at(k), CELL_SIZE)), pinned[i], PATH_TOLERANCE);
    const cellPoints = points.map(({x, y}) => pointAt(x, y, CELL_SIZE).map((n) => Number(n.toFixed(2))));
    // Out to the edge, where the trail leaves through its exit.
    const ends = [path[0], path[path.length - 1]].map((k) => exits.find((e) => middle(e) === k));
    if (ends[0]) cellPoints.unshift(edgePoint(ends[0], grid));
    if (ends[1] && i === 0 && exits.length > 1) cellPoints.push(edgePoint(ends[1], grid));
    return {type, width: PATHS[type].width, points: cellPoints};
  });
}

// The middle of an exit's stretch of the map's edge, in cell coordinates.
function edgePoint(exit, grid) {
  const [a, b] = exitEdge(exit, grid);
  return pointAt((a.x + b.x) / 2, (a.y + b.y) / 2, CELL_SIZE).map((n) => Number(n.toFixed(2)));
}

// Steps from each open cell to the nearest tree (1 beside one).
function openDepth(grid) {
  const depth = new Float64Array(grid.open.length);
  let frontier = [];
  for (let k = 0; k < depth.length; k++) {
    if (grid.open[k]) continue;
    depth[k] = 0;
    frontier.push(k);
  }
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const k of frontier) {
      for (const n of grid.neighbors(k)) {
        if (grid.open[n] && depth[n] === 0) {
          depth[n] = d;
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  // Open cells with no trees anywhere near (or none at all) are deep.
  for (let k = 0; k < depth.length; k++) if (grid.open[k] && depth[k] === 0) depth[k] = 99;
  return depth;
}

// Douglas-Peucker, keeping the pinned indices.
function simplify(points, pinned, tolerance) {
  const keep = new Set([0, points.length - 1, ...pinned]);
  const sorted = [...keep].sort((a, b) => a - b);
  const reduce = (i, j) => {
    let worst = -1;
    let worstD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = lineDistance(points[k], points[i], points[j]);
      if (d > worstD) [worst, worstD] = [k, d];
    }
    if (worst < 0) return;
    keep.add(worst);
    reduce(i, worst);
    reduce(worst, j);
  };
  for (let n = 0; n + 1 < sorted.length; n++) reduce(sorted[n], sorted[n + 1]);
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

function lineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
