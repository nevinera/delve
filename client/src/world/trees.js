// Trees are terrain types in a tile: every cell of a size-N tree's N x N footprint is "tree_N".
// A tree never crosses a tile edge. Trees are found again by claiming footprints in row order:
// the first unclaimed tree cell met is always some tree's north-west corner.

export const TREE_SIZES = [1, 2, 3];
export const treeTerrain = (size) => `tree_${size}`;
const TREE = /^tree_([123])$/;

// Size of the tree a terrain palette entry stands for, or 0.
export function treeSize(name) {
  return Number(TREE.exec(name ?? "")?.[1] ?? 0);
}

// Every tree in the tile, as { i, j, size } with (i, j) its north-west cell.
export function findTrees(tile) {
  const n = tile.cells;
  const sizes = tile.palettes.terrain.map(treeSize);
  const claimed = new Uint8Array(n * n);
  const trees = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const size = sizes[tile.layers.terrain[j * n + i]];
      if (!size || claimed[j * n + i]) continue;
      trees.push({ i, j, size });
      for (let dj = 0; dj < size && j + dj < n; dj++) {
        for (let di = 0; di < size && i + di < n; di++) claimed[(j + dj) * n + i + di] = 1;
      }
    }
  }
  return trees;
}

// Puts a tree with its north-west cell at (i, j). Returns false, changing nothing, when it would
// leave the tile, stand in water, or overlap another tree.
export function plantTree(tile, i, j, size) {
  const n = tile.cells;
  if (i < 0 || j < 0 || i + size > n || j + size > n) return false;
  const sizes = tile.palettes.terrain.map(treeSize);
  for (let dj = 0; dj < size; dj++) {
    for (let di = 0; di < size; di++) {
      const k = (j + dj) * n + i + di;
      if (sizes[tile.layers.terrain[k]] || !Number.isNaN(tile.layers.water[k])) return false;
    }
  }
  const type = paletteIndex(tile, treeTerrain(size));
  for (let dj = 0; dj < size; dj++) {
    for (let di = 0; di < size; di++) tile.layers.terrain[(j + dj) * n + i + di] = type;
  }
  return true;
}

// Removes the tree covering cell (i, j), leaving grass. Returns false when there's none.
export function fellTree(tile, i, j) {
  const tree = findTrees(tile).find((t) => i >= t.i && i < t.i + t.size && j >= t.j && j < t.j + t.size);
  if (!tree) return false;
  const grass = paletteIndex(tile, "grass");
  for (let dj = 0; dj < tree.size; dj++) {
    for (let di = 0; di < tree.size; di++) tile.layers.terrain[(tree.j + dj) * tile.cells + tree.i + di] = grass;
  }
  return true;
}

// The palette index for a terrain type, adding it to the tile's palette when it's new.
function paletteIndex(tile, name) {
  const palette = tile.palettes.terrain;
  if (!palette.includes(name)) palette.push(name);
  return palette.indexOf(name);
}
