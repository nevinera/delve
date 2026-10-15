// Generates a square-grid dungeon cell map: rooms scattered over the rock,
// joined by one-cell corridors (a spanning tree of them, plus a few loops
// unless the map is a "tree"), with exits cut from the nearest room out to
// the edge. Called by generateCellMap (see generate.js) for themes on a
// square grid, with its random number generator and checked exit plan.
//
// Tags it heeds: tree (no loops), tight (rooms packed close), dry (no
// puddles or water), wet (many), rough (rubble about). The rest are for
// the hex generator, and are ignored here.
import {SIDES, sideCell, sideLength} from "./exits";
import {VERSION, fillOf} from "./format";
import {traceLabels} from "./places";

const MARGIN = 1;
const GAP = 2;
const TIGHT_GAP = 1;
const ROOM_MIN = 3;
const ROOM_MAX = 9;
// Rooms' share of the map inside the margin, and the fewest and most tried.
const COVER = 0.32;
const TIGHT_COVER = 0.42;
const TRIES = 400;
// Of the pairs of rooms the tree leaves, this share (by room count) gets a
// loop.
const LOOPS = 0.3;
const RUBBLE = {rough: 0.22, plain: 0.06};
const PUDDLE_ROOMS = {wet: 0.7, plain: 0.25};

const NEIGHBORS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function generateDungeon({cols, rows, seed, wanted, connections, tags, theme}, rng) {
  const has = new Set(tags);
  const open = new Uint8Array(cols * rows);
  const key = (c, r) => c + r * cols;
  const rooms = placeRooms(cols, rows, has, rng);
  const roomOf = new Int16Array(cols * rows).fill(-1);
  rooms.forEach((room, i) => eachCell(room, (c, r) => {
    open[key(c, r)] = 1;
    roomOf[key(c, r)] = i;
  }));

  const carve = (from, to) => {
    for (const [c, r] of elbow(from, to, rng)) open[key(c, r)] = 1;
  };
  for (const [a, b] of links(rooms, has, rng)) carve(centerOf(rooms[a]), centerOf(rooms[b]));
  const exits = cutExits(cols, rows, rooms, wanted ?? rng.shuffle(SIDES).slice(0, connections).map((side) => ({side})), carve, open, key, rng);

  const fill = fillOf(theme);
  const ground = groundCells(cols, rows, rooms, open, has, rng);
  const cells = Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => (open[key(c, r)] ? ground[key(c, r)] : fill)).join(""));
  const places = placesOf(cols, rows, open, roomOf, rooms.length);
  return {version: VERSION, theme, grid: {type: "square", cols, rows}, seed, cells, ...(exits.length ? {exits} : {}), ...(places.length ? {places} : {})};
}

const eachCell = ({col, row, w, h}, fn) => {
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) fn(c, r);
};

const centerOf = ({col, row, w, h}) => [col + Math.floor(w / 2), row + Math.floor(h / 2)];

// Rooms as {col, row, w, h}, none nearer another than the gap or the edge
// than the margin, until they cover enough of the map.
function placeRooms(cols, rows, has, rng) {
  const gap = has.has("tight") ? TIGHT_GAP : GAP;
  const room = (cols - 2 * MARGIN) * (rows - 2 * MARGIN);
  const wantArea = room * (has.has("tight") ? TIGHT_COVER : COVER);
  const maxSide = (limit) => Math.max(ROOM_MIN, Math.min(ROOM_MAX, limit - 2 * MARGIN));
  const rooms = [];
  let area = 0;
  for (let t = 0; t < TRIES && area < wantArea; t++) {
    const w = rng.int(ROOM_MIN, maxSide(cols));
    const h = rng.int(ROOM_MIN, maxSide(rows));
    if (w > cols - 2 * MARGIN || h > rows - 2 * MARGIN) continue;
    const col = rng.int(MARGIN, cols - MARGIN - w);
    const row = rng.int(MARGIN, rows - MARGIN - h);
    const clear = rooms.every((o) => col >= o.col + o.w + gap || o.col >= col + w + gap || row >= o.row + o.h + gap || o.row >= row + h + gap);
    if (!clear) continue;
    rooms.push({col, row, w, h});
    area += w * h;
  }
  return rooms;
}

// Pairs of room indices to join: a minimum spanning tree by distance
// between centers, and (unless "tree") loops through some of the nearest
// pairs left.
function links(rooms, has, rng) {
  if (rooms.length < 2) return [];
  const centers = rooms.map(centerOf);
  const dist = (a, b) => Math.abs(centers[a][0] - centers[b][0]) + Math.abs(centers[a][1] - centers[b][1]);
  const pairs = [];
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) pairs.push([a, b]);
  pairs.sort((p, q) => dist(...p) - dist(...q));
  const parent = rooms.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const tree = [];
  const rest = [];
  for (const pair of pairs) {
    const [ra, rb] = pair.map(find);
    if (ra === rb) rest.push(pair);
    else {
      parent[ra] = rb;
      tree.push(pair);
    }
  }
  const loops = has.has("tree") ? 0 : Math.round(rooms.length * LOOPS);
  return [...tree, ...rest.slice(0, loops * 2).filter(() => rng() < 0.5).slice(0, loops)];
}

// The cells of a corridor with one bend, from one cell to another, going
// along the row or the column first.
function elbow([c1, r1], [c2, r2], rng) {
  const out = [];
  const [bc, br] = rng() < 0.5 ? [c2, r1] : [c1, r2];
  const run = ([ca, ra], [cb, rb]) => {
    const steps = Math.max(Math.abs(cb - ca), Math.abs(rb - ra));
    for (let k = 0; k <= steps; k++) out.push([ca + Math.sign(cb - ca) * k, ra + Math.sign(rb - ra) * k]);
  };
  run([c1, r1], [bc, br]);
  run([bc, br], [c2, r2]);
  return out;
}

// An exit on each planned side, a corridor from the nearest room to a spot
// along the edge. Returns the exits as the cellMap stores them.
function cutExits(cols, rows, rooms, plan, carve, open, key, rng) {
  if (!rooms.length) return [];
  const grid = {cols, rows};
  const exits = [];
  for (const {side, at} of plan) {
    const length = sideLength(side, grid);
    const spot = Math.max(1, Math.min(length - 2, at === undefined ? Math.round(length * (0.3 + 0.4 * rng())) : Math.round(at * (length - 1))));
    const edge = sideCell(side, spot, grid);
    const near = rooms.map(centerOf).sort((p, q) => Math.abs(p[0] - edge[0]) + Math.abs(p[1] - edge[1]) - Math.abs(q[0] - edge[0]) - Math.abs(q[1] - edge[1]))[0];
    carve(edge, near);
    const isOpen = (i) => i >= 0 && i < length && open[key(...sideCell(side, i, grid))];
    let [from, to] = [spot, spot];
    while (isOpen(from - 1)) from--;
    while (isOpen(to + 1)) to++;
    for (let i = 0; i < length; i++) if (isOpen(i)) [from, to] = [Math.min(from, i), Math.max(to, i)];
    for (let i = from; i <= to; i++) open[key(...sideCell(side, i, grid))] = 1;
    exits.push({side, from, to});
  }
  return SIDES.flatMap((side) => exits.filter((e) => e.side === side));
}

// Each open cell's letter: floor, with rubble scattered, and some rooms
// with a puddle or a pool at the middle.
function groundCells(cols, rows, rooms, open, has, rng) {
  const ground = new Array(cols * rows).fill(".");
  const rubble = has.has("rough") ? RUBBLE.rough : RUBBLE.plain;
  for (let k = 0; k < ground.length; k++) if (open[k] && rng() < rubble) ground[k] = "%";
  if (has.has("dry")) return ground;
  const share = has.has("wet") ? PUDDLE_ROOMS.wet : PUDDLE_ROOMS.plain;
  for (const room of rooms) {
    if (room.w < 4 || room.h < 4 || rng() >= share) continue;
    const [pc, pr] = centerOf(room);
    const deep = room.w >= 6 && room.h >= 6 && rng() < 0.5;
    eachCell({col: pc - 1, row: pr - 1, w: 2, h: 2}, (c, r) => { ground[c + r * cols] = deep ? "w" : "~"; });
    if (deep) for (const [dc, dr] of NEIGHBORS) if (rng() < 0.5) ground[pc + dc + (pr + dr) * cols] = "~";
  }
  return ground;
}

// One place per room (area_1, area_2, ...): open ground goes to the room
// it's nearest by ways through it, and the rock to the nearest place.
function placesOf(cols, rows, open, roomOf, count) {
  if (!count) return [];
  const label = new Int16Array(cols * rows).fill(-1);
  let frontier = [];
  for (let k = 0; k < label.length; k++) if (roomOf[k] >= 0) {
    label[k] = roomOf[k];
    frontier.push(k);
  }
  const spread = (may) => {
    while (frontier.length) {
      const next = [];
      for (const k of frontier) {
        const [c, r] = [k % cols, Math.floor(k / cols)];
        for (const [dc, dr] of NEIGHBORS) {
          const [nc, nr] = [c + dc, r + dr];
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const n = nc + nr * cols;
          if (label[n] >= 0 || !may(n)) continue;
          label[n] = label[k];
          next.push(n);
        }
      }
      frontier = next;
    }
  };
  spread((k) => open[k] === 1);
  frontier = [];
  for (let k = 0; k < label.length; k++) if (label[k] >= 0) frontier.push(k);
  spread(() => true);
  const outlines = traceLabels({type: "square", cols, rows}, (c, r) => {
    const l = label[c + r * cols];
    return l >= 0 ? l : null;
  });
  const order = [...outlines.keys()].sort((a, b) => a - b);
  return order.map((l, i) => ({identifier: `area_${i + 1}`, polygon: outlines.get(l)}));
}
