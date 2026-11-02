import { TILE_CELLS } from "../v2/caves.js";
import { CELL_FT, CHUNK_FT, TILE_FT } from "../v2/sizes.js";
import { entranceCells } from "./caveLayout.js";
import { caveMesh, chains, cutMesh, fitPlane, zipSteps } from "./caveMesh.js";

// How an entrance (caveLayout.js's) meets the ground, worked out in the editor and kept in the
// caves files (docs/formats/caves.md), so what draws it only applies it:
// - cells: the ground cells left out, [ci, cj] each (caveLayout.js's entranceCells);
// - plane: the plane nearest the edge of the ground left (fitPlane's), its normal facing the
//   entrance's mouth; the rock is cut back to its other side, near it (caveMesh.js's cutMesh);
// - ground: the ground's edge round the cells left out at the mouth, its corners in order;
// - rock: the rock's edge where it's cut back, in order;
// - steps: how the two are zipped together (caveMesh.js's zipSteps), ground and rock as turned;
// - chunks: the ground's chunks round it, [cx, cz] each, mouth to far end and the cells left out,
//   that nothing moves (ground.js's raise and clear), so none of this goes stale.
// Null where the entrance doesn't open through the ground, or its edges don't close.
//
// world: as caveMesh.js's, with the caves as carved; groundAt(x, z): the ground's height.
export function entranceJoin(entrance, world, groundAt) {
  const cells = entranceCells(entrance, groundAt);
  if (!cells.length) return null;
  const out = new Set(cells.map(([ci, cj]) => `${ci},${cj}`));
  const left = (ci, cj) => out.has(`${ci},${cj}`) || world.mouth(ci, cj);
  const corner = (ci, cj) => [ci * CELL_FT, groundAt(ci * CELL_FT, cj * CELL_FT), cj * CELL_FT];
  // The ground's edge: each side of a cell left out where the cell beside it isn't.
  const edges = [];
  for (const [ci, cj] of cells) {
    if (!left(ci, cj - 1)) edges.push(...corner(ci, cj), ...corner(ci + 1, cj));
    if (!left(ci, cj + 1)) edges.push(...corner(ci, cj + 1), ...corner(ci + 1, cj + 1));
    if (!left(ci - 1, cj)) edges.push(...corner(ci, cj), ...corner(ci, cj + 1));
    if (!left(ci + 1, cj)) edges.push(...corner(ci + 1, cj), ...corner(ci + 1, cj + 1));
  }
  // The one round the mouth, where the tube's thin roof opens the ground elsewhere too.
  const middle = (line) => [0, 1, 2].map((k) => line.reduce((sum, p) => sum + p[k], 0) / line.length);
  const ground = chains(edges).reduce((best, line) => (!best || Math.hypot(...middle(line).map((v, k) => v - entrance.mouth[k])) < Math.hypot(...middle(best).map((v, k) => v - entrance.mouth[k])) ? line : best), null);
  if (!ground || ground.length < 3) return null;
  const fitted = fitPlane(ground);
  const side = entrance.mouth.reduce((sum, v, k) => sum + (v - fitted.center[k]) * fitted.normal[k], 0) < 0 ? -1 : 1;
  const normal = fitted.normal.map((v) => v * side);
  const plane = { ...fitted, normal };
  // The rock cut back, in the tiles round the cells left out.
  const tiles = new Set();
  for (const [ci, cj] of cells) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) tiles.add(`${Math.floor((ci + di) / TILE_CELLS)},${Math.floor((cj + dj) / TILE_CELLS)}`);
  }
  // The rock as it'll be drawn: closed over the ground round the cells left out.
  const sealed = ringed(out);
  const closedOver = { ...world, sealed: (ci, cj) => sealed.has(`${ci},${cj}`) || Boolean(world.sealed?.(ci, cj)) };
  const seam = [];
  for (const key of tiles) {
    const [tx, tz] = key.split(",").map(Number);
    const mesh = caveMesh(tx, tz, closedOver);
    if (mesh) seam.push(...cutMesh(mesh, plane, [tx * TILE_FT, 0, tz * TILE_FT]).seam);
  }
  // The tube's cut: the seam's longest line, closed across the gaps the rock's tiles leave between
  // them, so long as it doesn't cross itself.
  const rock = longest(chains(seam));
  if (!rock || rock.length < 3 || Math.hypot(...rock[0].map((v, k) => v - rock.at(-1)[k])) > GAP_FT) return null;
  if (crosses(ground, plane) || crosses(rock, plane)) return null;
  const { a, b, steps } = zipSteps(ground, rock, plane);
  return { cells, plane, ground: a, rock: b, steps, chunks: heldChunks(entrance, cells) };
}

// The chunks within the entrance's width and a cell of the line from its mouth to its far end,
// and those the cells left out are in, edges and all.
function heldChunks(entrance, cells) {
  const reach = entrance.width + CELL_FT;
  const [ax, az, bx, bz] = [entrance.mouth[0], entrance.mouth[2], entrance.at[0], entrance.at[2]];
  const length = Math.hypot(bx - ax, bz - az);
  const held = new Set();
  for (let d = 0; d <= length + CELL_FT; d += CELL_FT) {
    const t = Math.min(1, d / (length || 1));
    const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];
    for (let cz = Math.floor((z - reach) / CHUNK_FT); cz <= Math.floor((z + reach) / CHUNK_FT); cz++) {
      for (let cx = Math.floor((x - reach) / CHUNK_FT); cx <= Math.floor((x + reach) / CHUNK_FT); cx++) held.add(`${cx},${cz}`);
    }
  }
  for (const [ci, cj] of cells) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) held.add(`${Math.floor(((ci + di) * CELL_FT) / CHUNK_FT)},${Math.floor(((cj + dj) * CELL_FT) / CHUNK_FT)}`);
  }
  return [...held].map((key) => key.split(",").map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

const GAP_FT = 2 * CELL_FT; // the widest gap between a line's ends that it's closed across

// Whether line `line`, closed, crosses itself, flattened onto `plane`.
function crosses(line, { center, across, along }) {
  const flat = line.map((p) => [across, along].map((axis) => axis.reduce((sum, v, k) => sum + v * (p[k] - center[k]), 0)));
  const turn = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  const n = flat.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [flat[i], flat[i + 1], flat[j], flat[(j + 1) % n]];
      if (turn(a, c, d) * turn(b, c, d) < 0 && turn(a, b, c) * turn(a, b, d) < 0) return true;
    }
  }
  return false;
}

const longest = (lines) => lines.reduce((best, line) => (!best || line.length > best.length ? line : best), null);

// Cells "ci,cj", and those round them.
export function ringed(cells) {
  const out = new Set();
  for (const key of cells) {
    const [ci, cj] = key.split(",").map(Number);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) out.add(`${ci + di},${cj + dj}`);
  }
  return out;
}
