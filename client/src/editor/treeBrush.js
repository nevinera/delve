import { gunzipSync, gzipSync } from "fflate";
import { decodeTile, encodeTile } from "../world/tileCodec.js";
import { fellTree, plantTree } from "../world/trees.js";
import { tilesTouched } from "./region.js";
import { tilePath } from "./thumbnails.js";

const GAP_CELLS = 2; // cells left between trees planted along one drag

// The tree brush paints trees straight into the active zone's generated tiles, or removes them with
// alt held. Painted tiles stay decoded until the stroke ends, then go back into the world.
// Regenerating a tile replaces its trees.
export class TreeBrush {
  constructor(editor) {
    this.editor = editor;
    this.tiles = new Map(); // "tx,tz" -> decoded tile, for this stroke
    this.changed = new Set();
    this.editable = null;
    this.last = null; // where this stroke last planted
  }

  // One step of a stroke at a continent position (tile units).
  apply(zone, [x, z], size, erase) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    const tile = this.tile(zone, tx, tz);
    if (!tile) return;
    const n = tile.cells;
    const ci = Math.floor((x - tx) * n);
    const cj = Math.floor((z - tz) * n);
    let changed;
    if (erase) {
      changed = fellTree(tile, ci, cj);
    } else {
      if (this.last && Math.hypot(x - this.last[0], z - this.last[1]) * n < size + GAP_CELLS) return;
      // The tree centers on the pointer's cell, nudged to stay inside the tile.
      const half = Math.floor((size - 1) / 2);
      const i = Math.max(0, Math.min(n - size, ci - half));
      const j = Math.max(0, Math.min(n - size, cj - half));
      changed = plantTree(tile, i, j, size);
      if (changed) this.last = [x, z];
    }
    if (!changed) return;
    this.changed.add(`${tx},${tz}`);
    this.editor.treesChanged(tx, tz, tile);
  }

  tile(zone, tx, tz) {
    const key = `${tx},${tz}`;
    if (this.tiles.has(key)) return this.tiles.get(key);
    this.editable ??= new Set(tilesTouched(zone.region).map(([x, z]) => `${x},${z}`));
    if (!this.editable.has(key)) {
      this.editor.say("Trees go on the zone's editable tiles.");
      return null;
    }
    const bytes = this.editor.world.files.get(tilePath(this.editor.continent, tx, tz));
    if (!bytes) {
      this.editor.say("Generate this tile before planting trees on it.");
      return null;
    }
    const tile = decodeTile(gunzipSync(bytes));
    this.tiles.set(key, tile);
    return tile;
  }

  // Ends the stroke, writing changed tiles back into the world. Returns whether any changed.
  finish() {
    for (const key of this.changed) {
      const [tx, tz] = key.split(",").map(Number);
      const gz = gzipSync(encodeTile(this.tiles.get(key)), { level: 9, mtime: 0 });
      this.editor.world.files.set(tilePath(this.editor.continent, tx, tz), gz);
    }
    const any = this.changed.size > 0;
    this.tiles.clear();
    this.changed.clear();
    this.editable = null;
    this.last = null;
    return any;
  }

  // The 2D map's tool for one tree size.
  tool(zone, size) {
    return {
      down: (tile, e) => {
        this.editor.say();
        this.apply(zone, tile, size, e.altKey);
        return true;
      },
      move: (tile, e) => this.apply(zone, tile, size, e.altKey),
      up: () => this.editor.treesDone(),
    };
  }
}
