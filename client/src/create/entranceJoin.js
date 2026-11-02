import { TILE_CELLS } from "../v2/caves.js";
import { CELL_FT, TILE_FT } from "../v2/sizes.js";
import { entranceCells } from "./caveLayout.js";
import { caveMesh, chains, cutMesh, fitPlane, zipSteps } from "./caveMesh.js";

// How an entrance (caveLayout.js's) meets the ground, worked out in the editor and kept in the
// caves files (docs/formats/caves.md), so what draws it only applies it:
// - cells: the ground cells left out, [ci, cj] each (caveLayout.js's entranceCells);
// - plane: the plane nearest the edge of the ground left (fitPlane's), its normal facing the
//   entrance's mouth; the rock is cut back to its other side, near it (caveMesh.js's cutMesh);
// - ground: the ground's edge round the cells left out, its corners in order;
// - rock: the rock's edge where it's cut back, in order;
// - steps: how the two are zipped together (caveMesh.js's zipSteps), ground and rock as turned.
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
  const ground = longest(chains(edges));
  if (!ground || ground.length < 3) return null;
  const fitted = fitPlane(ground);
  const side = entrance.mouth.reduce((sum, v, k) => sum + (v - fitted.center[k]) * fitted.normal[k], 0) < 0 ? -1 : 1;
  const plane = { ...fitted, normal: fitted.normal.map((v) => v * side) };
  // The rock cut back, in the tiles round the cells left out.
  const tiles = new Set();
  for (const [ci, cj] of cells) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) tiles.add(`${Math.floor((ci + di) / TILE_CELLS)},${Math.floor((cj + dj) / TILE_CELLS)}`);
  }
  const seam = [];
  for (const key of tiles) {
    const [tx, tz] = key.split(",").map(Number);
    const mesh = caveMesh(tx, tz, world);
    if (mesh) seam.push(...cutMesh(mesh, plane, [tx * TILE_FT, 0, tz * TILE_FT]).seam);
  }
  const middle = (line) => [0, 1, 2].map((k) => line.reduce((sum, p) => sum + p[k], 0) / line.length);
  const rock = chains(seam).reduce((best, line) => (!best || Math.hypot(...middle(line).map((v, k) => v - plane.center[k])) < Math.hypot(...middle(best).map((v, k) => v - plane.center[k])) ? line : best), null);
  if (!rock || rock.length < 3) return null;
  const { a, b, steps } = zipSteps(ground, rock, plane);
  return { cells, plane, ground: a, rock: b, steps };
}

const longest = (lines) => lines.reduce((best, line) => (!best || line.length > best.length ? line : best), null);
