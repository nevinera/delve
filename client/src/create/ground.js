import * as THREE from "three";
import { disposeGround, groundMaterial } from "../editor/groundMaterial.js";
import { BiomeMap, bakePlate, changedBoxes } from "../v2/biomes.js";
import { ACROSS, AROUND, WATER_TYPES, WaterMap, bakeWater, changedWaterBoxes, missingSea, partWater, seaEdges } from "../v2/water.js";
import { LEDGE_RAISE_FT, LEVEE_FT, courseBox, shape } from "../v2/courses.js";
import { waterMaterial } from "../editor/waterMaterial.js";
import { SHORE_FADE_FT, WATER_LOOKS } from "./waterSurface.js";
import { PATTERNS, RUNNING, look, painted, slopeOf } from "../v2/look.js";
import { makeSlots } from "../v2/slots.js";
import { CELL_CORNERS, TILE_CELLS, decodePlate, encodePlate, platePath, tileIndexInPlate } from "../v2/plate.js";
import { loadZipper } from "../v2/zstd.js";
import { CORNERS, decodePlatter, encodePlatter, indexIn, plateIndexIn, platterOf, platterOfPlate, platterPath } from "../v2/platter.js";
import { CELL_FT, CHUNK_CELLS, CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_FT, PLATTER_PLATES, PLATTER_TILES, SEA_LEVEL_FT, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";
import { CELLS, CHUNKS, TILES } from "./geo.js";
import { withGrid } from "./grid.js";
import { pressHeights, pressedCorners } from "./press.js";

// The ground round the builder, a tile at a time, finer the nearer the tile is to the builder's:
// - within FULL_TILES, drawn in full, smooth-shaded at cell scale with the patterns of its kinds of
//   ground, as walk mode draws it (editor/groundMaterial.js)
// - within FINE_TILES, flat-shaded at cell scale (its chunks' renditions, v2/plate.js)
// - within COARSE_TILES, from its rendition, a part a chunk (v2/platter.js)
// - further, from its plate's rendition, a part a tile, out to plates within FAR_FT;
// - further still, the same, but a platter's plates in one mesh, out to plates within the
//   builder's reach: FAR_FT, and REACH_PER_FT more for each foot the builder's over the ground,
//   up to REACH_FT.
// All but the full ground are flat-shaded in their parts' colors.
// Flying higher over the ground than half a tier's square is wide, that tier isn't drawn at all.
// A tile's distance is in tiles, the most of how far it is east or west, north or south, and up
// or down (its ground's heights against the builder's, in tiles' widths), so each tier is a
// square round the builder's tile, and flying high, the ground below goes coarser too. What's drawn
// changes only when the builder leaves their tile, and then a plate at a time: each plate's ground
// is drawn in a few meshes, made again when how its tiles are drawn changes. Skirts hang from
// where tiles drawn differently meet, to hide the gaps between them. Tiles drawn from renditions
// have their water drawn from them too, a part a chunk, but the sea, which sea.js's plane stands
// in for there; tiles drawn from their plate's, lifted to its ground where that's higher, as it's
// drawn coarser than the water.

export const FULL_TILES = 4;
export const FINE_TILES = 8;
export const COARSE_TILES = 16;
export const FAR_FT = 24576;
export const REACH_FT = 160000; // about 30 miles
const REACH_PER_FT = 1.5;
const LEAVE_FT = 32; // how far past their tile's edge the builder goes before what's drawn changes
const SKIRT = 0.75; // how far a skirt hangs, as a share of a part's size
const SKIRT_SHADE = 0.6;
const KEEP_PLATES = 40; // plate files kept decoded
const BUILD_MS = 6; // how long a frame spends making plates
export const EMPTY_FT = -100; // the sea floor's height where there are no tiles
const TINT = 0.8; // how far toward its biome's color ground's mixed, showing biomes
const CHUNK_CELLS_HALF = CHUNK_CELLS / 2;
const SHORE_CELLS = 4; // how far from water ground can be shore

// A continent's renditions, from its platter files, and its ground at cell scale, from its plate
// files, read on a worker (plateWorker.js) as they're wanted. onRead() is called each time a plate
// file has been read. The ground moved by hand (raise) is moved in the renditions and the plate
// files read, and kept as offsets, to move plate files read later. Where there are no tiles, the
// sea floor's flat at EMPTY_FT, and moving it makes tiles there.
export class Renditions {
  constructor() {
    this.platters = new Map(); // "px,pz" -> { coords, tiles, plates }
    this.plateFiles = new Map(); // "px,pz" -> gzipped bytes
    this.decoded = new Map(); // "px,pz" -> decoded plate file, the latest used last
    this.reading = new Set(); // "px,pz" of plate files being read
    this.unreadable = new Set(); // "px,pz" of plate files that couldn't be read
    this.worker = null;
    this.onRead = () => {};
    // How far the ground's been moved, by how finely: "tx,tz" -> 65 × 65 cell corners, "tx,tz" ->
    // 9 × 9 chunk corners, and "px,pz" -> 9 × 9 tile corners.
    this.offsets = { [CELLS]: new Map(), [CHUNKS]: new Map(), [TILES]: new Map() };
    this.changed = new Set(); // "px,pz" of plates whose ground's been moved
    this.unsaved = new Set(); // the same, since they were last saved (filesFor)
    this.writes = new Map(); // id -> resolve, for files being written on the worker
    this.made = new Map(); // "px,pz" -> indexes in the plate of tiles made where there were none
    this.cleared = new Map(); // "px,pz" -> indexes in the plate of tiles cleared away
    this.layout = 0; // counts tiles made and cleared, to tell when which there are has changed
    this.biomeAreas = []; // the biome areas, as biomes.json keeps them
    this.biomes = new BiomeMap(); // and which biome is where from them, baked into plate files saved
    this.biomeCells = new Map(); // "tx,tz" -> its cells' biomes, worked out as they're wanted
    this.looks = 0; // counts changes to the biomes, to tell when what ground looks like is stale
    this.waterFile = { bodies: [], courses: [] }; // the water's bodies and courses, as water.json keeps them
    this.water = new WaterMap(); // and the water from them, baked into plate files saved
    this.cuts = new Map(); // "tx,tz" -> how far courses cut the tile's corners, over what its plate file has
    this.waters = new Map(); // "tx,tz" -> the tile's water as last baked, over what its plate file has
    this.wet = 0; // counts changes to tiles' water
    this.wetPlates = new Set(); // "px,pz" of plates whose renditions' water changed, to draw again
    // What presses tile (tx, tz)'s ground down where it's drawn and walked on (press.js), as
    // pressesOver() has it, or null for none; and a count of changes to that.
    this.pressesOver = null;
    this.pressings = 0;
  }

  // Tile (tx, tz)'s cell corners' heights as they're drawn and walked on: `cells.heights`, pressed
  // down by slabs (press.js). Kept with the cells, the same array till what presses it changes.
  pressedHeights(tx, tz, cells) {
    if (!this.pressesOver) return cells.heights;
    if (cells.press?.count === this.pressings) return cells.press.heights;
    const presses = this.pressesOver(tx, tz);
    const key = presses.length ? JSON.stringify(presses) : "";
    if (cells.press?.key !== key) cells.press = { key, heights: pressHeights(cells.heights, pressedCorners(presses, tx, tz)) };
    cells.press.count = this.pressings;
    return cells.press.heights;
  }

  // After what presses the ground changes: the "px,pz" of plates read whose tiles are pressed
  // differently now.
  repress() {
    this.pressings++;
    const moved = new Set();
    for (const [key, plate] of this.decoded) {
      const [px, pz] = key.split(",").map(Number);
      for (const [index, cells] of plate.tiles) {
        if (!cells.press) continue;
        const before = cells.press.heights;
        const [tx, tz] = [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];
        if (this.pressedHeights(tx, tz, cells) !== before) moved.add(key);
      }
    }
    return moved;
  }

  // Tile (tx, tz)'s cells' biomes, 64 × 64 indexes into BIOME_NAMES.
  biomeTile(tx, tz) {
    const key = `${tx},${tz}`;
    if (!this.biomeCells.has(key)) this.biomeCells.set(key, this.biomes.tile(tx, tz));
    return this.biomeCells.get(key);
  }

  // Takes the biome areas, and with `dirty`, marks the plates where which biome is where changed,
  // to save again. Gives their "px,pz".
  setBiomes(areas, dirty = true) {
    const boxes = changedBoxes(this.biomeAreas, areas);
    this.biomeAreas = areas;
    this.biomes = new BiomeMap(areas);
    this.biomeCells.clear();
    this.looks++;
    this.worker?.postMessage({ biomes: areas });
    return dirty ? this.markBoxes(boxes) : new Set();
  }

  // Takes the water's bodies and courses, { bodies, courses } as water.json keeps them, and with
  // `dirty`, carves the courses that changed into the ground and marks the plates where the water
  // changed, to save again. Gives their "px,pz".
  setWater(file, dirty = true) {
    const boxes = changedWaterBoxes(this.waterFile, file);
    const courses = changedWaterBoxes({ courses: this.waterFile.courses }, { courses: file.courses });
    this.waterFile = file;
    this.water = new WaterMap(file.bodies, file.courses);
    this.worker?.postMessage({ water: file });
    if (!dirty) return new Set();
    const moved = this.carve(courses, file.courses ?? []);
    return new Set([...moved, ...this.markBoxes(boxes)]);
  }

  // Carves `courses` into the ground within `boxes` ([x0, z0, x1, z1]): each cell corner there put
  // back by what courses cut it before, then cut down under every course there (courses.js's
  // shape), or where none cuts it, built up a little where a course's bank is lower than its
  // water, or more under a fall's ledge, and how far kept with its cells. Gives the "px,pz" of the plates moved.
  carve(boxes, courses) {
    const moved = new Set();
    for (const [x0, z0, x1, z1] of boxes) {
      const near = courses.filter((course) => {
        const b = courseBox(course);
        return course.surface?.length && b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;
      });
      const deltas = new Map(); // "ci,cj" of a corner -> how far it moves
      for (let tz = Math.floor(z0 / TILE_FT); tz <= Math.floor(z1 / TILE_FT); tz++) {
        for (let tx = Math.floor(x0 / TILE_FT); tx <= Math.floor(x1 / TILE_FT); tx++) {
          const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
          const tile = (this.decoded.get(key) ?? (this.plateFiles.has(key) || this.made.has(key) ? this.readNow(key) : null))?.tiles.get(tileIndexInPlate(tx, tz));
          if (!tile) continue;
          const cut = tile.cut ?? new Float32Array(CELL_CORNERS * CELL_CORNERS);
          for (let j = 0; j < CELL_CORNERS; j++) {
            const z = tz * TILE_FT + j * CELL_FT;
            if (z < z0 || z > z1) continue;
            for (let i = 0; i < CELL_CORNERS; i++) {
              const x = tx * TILE_FT + i * CELL_FT;
              if (x < x0 || x > x1) continue;
              const k = j * CELL_CORNERS + i;
              const base = tile.heights[k] + cut[k];
              let [top, levee] = [base, base];
              for (const course of near) {
                const made = shape(course, x, z);
                if (!made) continue;
                top = Math.min(top, made.top);
                levee = Math.max(levee, Math.min(made.levee, base + (made.ledge ? LEDGE_RAISE_FT : LEVEE_FT)));
              }
              if (top === base) top = levee;
              cut[k] = base - top;
              if (top !== tile.heights[k]) deltas.set(`${tx * TILE_CELLS + i},${tz * TILE_CELLS + j}`, top - tile.heights[k]);
            }
          }
          tile.cut = cut.some((v) => v) ? cut : null;
          this.cuts.set(`${tx},${tz}`, tile.cut);
        }
      }
      if (!deltas.size) continue;
      const at = (x, z) => deltas.get(`${Math.round(x / CELL_FT)},${Math.round(z / CELL_FT)}`) ?? 0;
      for (const key of this.raise(at, [x0, z0, x1, z1], CELLS, false)) moved.add(key);
    }
    return moved;
  }

  // The ground at (x, z) as it was before courses cut it, where its cells are read, else as
  // heightAt has it.
  baseAt(x, z) {
    const height = this.heightAt(x, z);
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const cut = this.decoded.get(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`)?.tiles.get(tileIndexInPlate(tx, tz))?.cut;
    return height == null || !cut ? height : height + between(cut, CELL_CORNERS, (x - tx * TILE_FT) / CELL_FT, (z - tz * TILE_FT) / CELL_FT);
  }

  // Marks the plates `boxes` ([x0, z0, x1, z1]) touch, that have ground, to save again. Gives
  // their "px,pz".
  markBoxes(boxes) {
    const marked = new Set();
    for (const [x0, z0, x1, z1] of boxes) {
      for (let pz = Math.floor(z0 / PLATE_FT); pz <= Math.floor(z1 / PLATE_FT); pz++) {
        for (let px = Math.floor(x0 / PLATE_FT); px <= Math.floor(x1 / PLATE_FT); px++) {
          const key = `${px},${pz}`;
          if (this.plateFiles.has(key) || this.made.has(key)) marked.add(key);
        }
      }
    }
    for (const key of marked) {
      this.changed.add(key);
      this.unsaved.add(key);
    }
    return marked;
  }

  // Makes tile (tx, tz) where there's none, flat sea floor: its rendition, its plate's and platter's
  // when they're missing too, and its cells, put in its plate file as it's read (fill).
  make(tx, tz) {
    this.layout++;
    const [px, pz] = [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)];
    const floor = () => ({ heights: new Float32Array(CORNERS * CORNERS).fill(EMPTY_FT), hash: "0000000000000000" });
    const platterKey = platterOf(tx, tz).join(",");
    if (!this.platters.has(platterKey)) this.platters.set(platterKey, { coords: platterOf(tx, tz), tiles: new Map(), plates: new Map() });
    const platter = this.platters.get(platterKey);
    platter.tiles.set(indexIn(tx, tz), floor());
    if (!platter.plates.has(plateIndexIn(px, pz))) platter.plates.set(plateIndexIn(px, pz), floor());
    const key = `${px},${pz}`;
    if (!this.made.has(key)) this.made.set(key, new Set());
    this.made.get(key).add(tileIndexInPlate(tx, tz));
    this.cleared.get(key)?.delete(tileIndexInPlate(tx, tz));
    // Read again, to have the tile's cells.
    this.decoded.delete(key);
  }

  // Clears away the tiles whose middles are within `radius` ft of (x, z), and the one there, back to
  // empty sea, with their plates and platters where they're left with none. Gives the "px,pz" of
  // the plates they were in.
  clear(x, z, radius) {
    const moved = new Set();
    for (let tz = Math.floor((z - radius) / TILE_FT); tz <= Math.floor((z + radius) / TILE_FT); tz++) {
      for (let tx = Math.floor((x - radius) / TILE_FT); tx <= Math.floor((x + radius) / TILE_FT); tx++) {
        const under = tx === Math.floor(x / TILE_FT) && tz === Math.floor(z / TILE_FT);
        if (!this.tile(tx, tz) || (!under && Math.hypot((tx + 0.5) * TILE_FT - x, (tz + 0.5) * TILE_FT - z) > radius)) continue;
        const [px, pz] = [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)];
        const key = `${px},${pz}`;
        const index = tileIndexInPlate(tx, tz);
        this.platters.get(platterOf(tx, tz).join(",")).tiles.delete(indexIn(tx, tz));
        if (!this.cleared.has(key)) this.cleared.set(key, new Set());
        this.cleared.get(key).add(index);
        this.made.get(key)?.delete(index);
        this.offsets[CELLS].delete(`${tx},${tz}`);
        this.offsets[CHUNKS].delete(`${tx},${tz}`);
        this.decoded.get(key)?.tiles.delete(index);
        moved.add(key);
      }
    }
    for (const key of moved) {
      const [px, pz] = key.split(",").map(Number);
      let left = false;
      for (let j = 0; j < PLATE_TILES && !left; j++) for (let i = 0; i < PLATE_TILES && !left; i++) left = Boolean(this.tile(px * PLATE_TILES + i, pz * PLATE_TILES + j));
      if (left) continue;
      const platterKey = platterOfPlate(px, pz).join(",");
      const platter = this.platters.get(platterKey);
      platter.plates.delete(plateIndexIn(px, pz));
      this.offsets[TILES].delete(key);
      if (!platter.tiles.size) this.platters.delete(platterKey);
    }
    for (const key of moved) {
      this.changed.add(key);
      this.unsaved.add(key);
    }
    if (moved.size) this.layout++;
    return moved;
  }

  // Puts the tiles made in plate `key` into it, read from its file or made from nothing, and takes
  // out those cleared away, and their water as last baked and cuts as last carved.
  fill(key, plate) {
    for (const index of this.cleared.get(key) ?? []) plate.tiles.delete(index);
    const [px, pz] = key.split(",").map(Number);
    for (const [index, tile] of plate.tiles) {
      const key = `${px * PLATE_TILES + (index % PLATE_TILES)},${pz * PLATE_TILES + Math.floor(index / PLATE_TILES)}`;
      const [water, cut] = [this.waters.get(key), this.cuts.get(key)];
      if (water !== undefined) tile.water = water;
      if (cut !== undefined) tile.cut = cut;
    }
    for (const index of this.made.get(key) ?? []) {
      if (plate.tiles.has(index)) continue;
      const [px, pz] = key.split(",").map(Number);
      const slots = makeSlots(px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES));
      plate.tiles.set(index, { heights: new Float32Array(CELL_CORNERS * CELL_CORNERS).fill(EMPTY_FT), terrain: new Uint8Array(TILE_CELLS * TILE_CELLS), biome: new Uint8Array(TILE_CELLS * TILE_CELLS), slots });
    }
  }

  // Plate `key` read now, its made tiles and moves in, or null where it has no ground.
  readNow(key) {
    const [px, pz] = key.split(",").map(Number);
    const plate = this.plateFiles.has(key) ? decodePlate(this.plateFiles.get(key)) : this.made.has(key) ? { coords: [px, pz], palette: [], tiles: new Map() } : null;
    if (!plate) return null;
    this.fill(key, plate);
    this.offset(key, plate);
    return plate;
  }

  // The files of `continent` whose ground's been moved, path -> bytes: their platters, and their
  // plate files with the moves in, or null for those with nothing left in them.
  changedFiles(continent) {
    const files = new Map();
    const platters = new Set();
    for (const key of this.changed) {
      const [px, pz] = key.split(",").map(Number);
      platters.add(platterOfPlate(px, pz).join(","));
      const plate = this.decoded.get(key) ?? this.readNow(key);
      if (!plate?.tiles.size) {
        files.set(platePath(continent, [px, pz]), null);
        continue;
      }
      files.set(platePath(continent, [px, pz]), encodePlate(this.bake({ coords: [px, pz], palette: plate.palette, tiles: plate.tiles, around: this.around(px, pz), shores: this.shores(px, pz) })));
      this.baked([px, pz], [...plate.tiles].map(([index, tile]) => [index, tile.water]));
    }
    for (const key of platters) {
      const platter = this.platters.get(key);
      files.set(platterPath(continent, key.split(",").map(Number)), platter ? encodePlatter(platter) : null);
    }
    return files;
  }

  // The same for the plates moved since this was last asked, written on the worker.
  async unsavedFiles(continent) {
    const keys = [...this.unsaved];
    this.unsaved.clear();
    const files = new Map();
    const platters = new Set();
    const writing = [];
    for (const key of keys) {
      const [px, pz] = key.split(",").map(Number);
      platters.add(platterOfPlate(px, pz).join(","));
      const plate = this.decoded.get(key) ?? this.readNow(key);
      if (!plate?.tiles.size) {
        files.set(platePath(continent, [px, pz]), null);
        continue;
      }
      // Only what the file holds, not what's kept for drawing.
      const tiles = new Map([...plate.tiles].map(([index, { heights, slots, slotSeed, water, cut }]) => [index, { heights, slots, slotSeed, water, cut }]));
      writing.push(this.write("plate", { coords: [px, pz], palette: plate.palette, tiles, around: this.around(px, pz), shores: this.shores(px, pz) }).then((bytes) => files.set(platePath(continent, [px, pz]), bytes)));
    }
    // Platters after, with their tiles' water as the plates were baked.
    await Promise.all(writing);
    writing.length = 0;
    for (const key of platters) {
      if (!this.platters.has(key)) {
        files.set(platterPath(continent, key.split(",").map(Number)), null);
        continue;
      }
      const { coords, tiles, plates } = this.platters.get(key);
      const bare = (map) => new Map([...map].map(([index, { heights, hash, water }]) => [index, { heights, hash, water }]));
      writing.push(this.write("platter", { coords, tiles: bare(tiles), plates: bare(plates) }).then((bytes) => files.set(platterPath(continent, coords), bytes)));
    }
    await Promise.all(writing);
    return files;
  }

  // Writes a plate or platter file (`kind`) on the worker, or here where there are no workers.
  write(kind, value) {
    if (typeof Worker === "undefined") {
      return loadZipper().then(() => {
        if (kind !== "plate") return encodePlatter(value);
        const bytes = encodePlate(this.bake(value));
        this.baked(value.coords, [...value.tiles].map(([index, tile]) => [index, tile.water]));
        return bytes;
      });
    }
    this.startWorker();
    const id = this.writes.size ? Math.max(...this.writes.keys()) + 1 : 1;
    return new Promise((resolve) => {
      this.writes.set(id, ({ bytes, waters }) => {
        if (waters) this.baked(value.coords, waters);
        resolve(bytes);
      });
      this.worker.postMessage({ write: kind, id, value });
    });
  }

  // Takes the water baked into plate (px, pz)'s tiles, [index, water], to draw, and into their
  // renditions. Where its sea along a side's changed, the plate past that side's to be saved
  // again, to take the sea in from it.
  baked([px, pz], waters) {
    const plate = this.decoded.get(`${px},${pz}`);
    const before = this.edges(px, pz);
    for (const [index, water] of waters) {
      const [tx, tz] = [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];
      this.waters.set(`${tx},${tz}`, water);
      const tile = plate?.tiles.get(index);
      if (tile) tile.water = water;
      const rendition = this.tile(tx, tz);
      if (rendition) rendition.water = partWater(water);
    }
    this.wetPlates.add(`${px},${pz}`);
    this.wet++;
    const after = this.edges(px, pz);
    for (const [side, [dx, dz]] of Object.entries(PLATE_SIDES)) {
      if (before && before[side].every((v, k) => v === after[side][k])) continue;
      this.saveAgain(`${px + dx},${pz + dz}`);
    }
  }

  // Marks plate `key`, if there is one, to be saved again.
  saveAgain(key) {
    if (!this.plateFiles.has(key) && !this.made.has(key)) return;
    this.changed.add(key);
    this.unsaved.add(key);
  }

  // The water of plate (px, pz)'s tiles as last baked, or as its file has it, by where they are in
  // it, or null where it's not known.
  waterOf(px, pz) {
    const plate = this.decoded.get(`${px},${pz}`);
    return (a, b) => this.waters.get(`${px * PLATE_TILES + a},${pz * PLATE_TILES + b}`) ?? plate?.tiles.get(b * PLATE_TILES + a)?.water ?? null;
  }

  // The sea along plate (px, pz)'s sides, as water.js's seaEdges(), or null where its plate's not
  // been read and none of its water's been baked.
  edges(px, pz) {
    const key = `${px},${pz}`;
    let known = this.decoded.has(key);
    for (let b = 0; b < PLATE_TILES && !known; b++) for (let a = 0; a < PLATE_TILES && !known; a++) known = this.waters.has(`${px * PLATE_TILES + a},${pz * PLATE_TILES + b}`);
    return known ? seaEdges(this.waterOf(px, pz)) : null;
  }

  // Which cells just past each of plate (px, pz)'s sides are sea, as water.js's bakeWater wants
  // them, from the plates next to it, read now where they're not.
  shores(px, pz) {
    const shores = {};
    for (const [side, [dx, dz]] of Object.entries(PLATE_SIDES)) {
      const key = `${px + dx},${pz + dz}`;
      if (!this.plateFiles.has(key) && !this.made.has(key)) continue;
      if (!this.edges(px + dx, pz + dz)) {
        const plate = this.readNow(key);
        if (plate) this.keep(key, plate);
      }
      const edges = this.edges(px + dx, pz + dz);
      if (edges) shores[side] = edges[ACROSS[side]];
    }
    return shores;
  }

  // Marks plate `key`, just read, or the plates next to it, to be saved again where one's dry
  // ground lower than the sea is next to the other's sea, so the sea spreads across.
  checkShores(key) {
    const [px, pz] = key.split(",").map(Number);
    const plate = this.decoded.get(key);
    const mine = seaEdges(this.waterOf(px, pz));
    for (const [side, [dx, dz]] of Object.entries(PLATE_SIDES)) {
      const next = `${px + dx},${pz + dz}`;
      const other = this.decoded.get(next);
      if (!other) continue;
      if (missingSea(plate, side, seaEdges(this.waterOf(px + dx, pz + dz))[ACROSS[side]])) this.saveAgain(key);
      if (missingSea(other, ACROSS[side], mine[side])) this.saveAgain(next);
    }
  }

  // Which tiles there are round plate (px, pz), as water.js's bakeWater wants them.
  around(px, pz) {
    const around = new Uint8Array(AROUND * AROUND);
    for (let b = 0; b < AROUND; b++) for (let a = 0; a < AROUND; a++) around[b * AROUND + a] = this.tile(px * PLATE_TILES + a - 1, pz * PLATE_TILES + b - 1) ? 1 : 0;
    return around;
  }

  // Plate `plate` with its biomes and water baked in.
  bake(plate) {
    return bakeWater(bakePlate(plate, this.biomes), this.water);
  }

  startWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./plateWorker.js", import.meta.url), { type: "module" });
    this.worker.postMessage({ biomes: this.biomeAreas });
    this.worker.postMessage({ water: this.waterFile });
    this.worker.onmessage = ({ data }) => {
      if (data.id === undefined) return this.done(data);
      this.writes.get(data.id)(data);
      this.writes.delete(data.id);
    };
  }

  // Moves the ground by at(x, z) feet within `bounds`, [x0, z0, x1, z1] continent feet, worked out
  // on the corners of `level`'s squares (geo.js) and straight between them finer. Coarser
  // renditions' corners move by the average move round them, over a square as wide as their parts,
  // so a small brush makes a low, wide bump in them, not one as tall as it makes. Moves worked out
  // on corners are kept with a ring of corners round them, for smooth() to curve between. Gives
  // the "px,pz" of the plates whose ground moved. With `grow` false, it makes no tiles where
  // there are none.
  raise(at, [x0, z0, x1, z1], level, grow = true) {
    const moved = new Set();
    // at() on a grid `n` squares a side, `step` ft apart from (ox, oz), and `ring` more corners
    // round it, or null where it's all 0. With `half`, each corner's the average of at() over the
    // square `half` ft either way of it, taken `every` ft.
    const sample = (ox, oz, step, n, half = 0, every = 1, ring = 0) => {
      const side = n + 1 + 2 * ring;
      const out = new Float32Array(side * side);
      const offsets = [];
      for (let o = -half; o <= half; o += every) offsets.push(o);
      let any = false;
      for (let j = -ring; j <= n + ring; j++) {
        const z = oz + j * step;
        if (z < z0 - half || z > z1 + half) continue;
        for (let i = -ring; i <= n + ring; i++) {
          const x = ox + i * step;
          if (x < x0 - half || x > x1 + half) continue;
          let sum = 0;
          for (const dz of offsets) for (const dx of offsets) sum += at(x + dx, z + dz);
          const k = (j + ring) * side + i + ring;
          out[k] = sum / offsets.length ** 2;
          any ||= out[k] !== 0;
        }
      }
      return any ? out : null;
    };
    const RINGED = CORNERS + 2;
    // How the coarser renditions are sampled: [half, every] for plates' and tiles'.
    const plateFilter = level === TILES ? [0, 1] : level === CHUNKS ? [TILE_FT / 2, CHUNK_FT] : [TILE_FT / 2, CHUNK_FT / 2];
    const tileFilter = level === CELLS ? [CHUNK_FT / 2, CELL_FT * 2] : [0, 1];
    // Sea floor where the brush moves it and there are no tiles is made into tiles first.
    const [step, n] = level === CELLS ? [CELL_FT, TILE_CELLS] : level === CHUNKS ? [CHUNK_FT, TILE_CHUNKS] : [TILE_FT, 1];
    for (let tz = Math.floor(z0 / TILE_FT); tz <= Math.floor(z1 / TILE_FT); tz++) {
      for (let tx = Math.floor(x0 / TILE_FT); tx <= Math.floor(x1 / TILE_FT); tx++) {
        if (grow && !this.tile(tx, tz) && sample(tx * TILE_FT, tz * TILE_FT, step, n)) this.make(tx, tz);
      }
    }
    const add = (map, key, values) => {
      const kept = map.get(key);
      if (kept) for (let k = 0; k < values.length; k++) kept[k] += values[k];
      else map.set(key, values.slice());
    };
    const plateMoves = new Map();
    const [ph] = plateFilter;
    for (let pz = Math.floor((z0 - ph) / PLATE_FT); pz <= Math.floor((z1 + ph) / PLATE_FT); pz++) {
      for (let px = Math.floor((x0 - ph) / PLATE_FT); px <= Math.floor((x1 + ph) / PLATE_FT); px++) {
        const plate = this.plate(px, pz);
        const d = plate && sample(px * PLATE_FT, pz * PLATE_FT, TILE_FT, PLATE_TILES, ...plateFilter, 1);
        if (!d) continue;
        const key = `${px},${pz}`;
        for (let j = 0; j < CORNERS; j++) for (let i = 0; i < CORNERS; i++) plate.heights[j * CORNERS + i] += d[(j + 1) * RINGED + i + 1];
        delete plate.span;
        plateMoves.set(key, d);
        moved.add(key);
        if (level === TILES) {
          add(this.offsets[TILES], key, d);
          // Too coarse to be worth moving each cell: read again when wanted, offsets and all.
          this.decoded.delete(key);
        }
      }
    }
    const [th] = tileFilter;
    for (let tz = Math.floor((z0 - th) / TILE_FT); tz <= Math.floor((z1 + th) / TILE_FT); tz++) {
      for (let tx = Math.floor((x0 - th) / TILE_FT); tx <= Math.floor((x1 + th) / TILE_FT); tx++) {
        const tile = this.tile(tx, tz);
        if (!tile) continue;
        const [px, pz] = [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)];
        const [i0, j0] = [tx - px * PLATE_TILES, tz - pz * PLATE_TILES];
        // The tile's chunk corners' moves, and at CHUNKS, with a ring round them.
        let d, ringed = null;
        if (level === TILES) {
          const plateMove = plateMoves.get(`${px},${pz}`);
          if (!plateMove) continue;
          d = smooth(plateMove, RINGED, i0, j0, 1 / TILE_CHUNKS, CORNERS);
        } else {
          ringed = sample(tx * TILE_FT, tz * TILE_FT, CHUNK_FT, TILE_CHUNKS, ...tileFilter, 1);
          d = ringed && Float32Array.from({ length: CORNERS * CORNERS }, (_, k) => ringed[(Math.floor(k / CORNERS) + 1) * RINGED + (k % CORNERS) + 1]);
        }
        const key = `${tx},${tz}`;
        if (d) {
          for (let k = 0; k < d.length; k++) tile.heights[k] += d[k];
          delete tile.span;
          delete tile.faces;
          moved.add(`${px},${pz}`);
          if (level === CHUNKS) add(this.offsets[CHUNKS], key, ringed);
        }
        const cells = this.decoded.get(`${px},${pz}`)?.tiles.get(tileIndexInPlate(tx, tz));
        if (level === CELLS) {
          const fine = sample(tx * TILE_FT, tz * TILE_FT, CELL_FT, TILE_CELLS);
          if (!fine) continue;
          moved.add(`${px},${pz}`);
          add(this.offsets[CELLS], key, fine);
          if (cells) for (let k = 0; k < fine.length; k++) cells.heights[k] += fine[k];
        } else if (cells && ringed) {
          const fine = smooth(ringed, RINGED, 0, 0, 1 / CHUNK_CELLS, CELL_CORNERS);
          for (let k = 0; k < fine.length; k++) cells.heights[k] += fine[k];
        }
        if (cells) {
          delete cells.grid;
          delete cells.dressed;
          delete cells.press;
        }
      }
    }
    for (const key of moved) {
      this.changed.add(key);
      this.unsaved.add(key);
    }
    return moved;
  }

  // Moves a plate file just read by the offsets kept for it.
  offset(key, plate) {
    const [px, pz] = key.split(",").map(Number);
    const plateMove = this.offsets[TILES].get(key);
    for (const [index, cells] of plate.tiles) {
      const [i0, j0] = [index % PLATE_TILES, Math.floor(index / PLATE_TILES)];
      const tileKey = `${px * PLATE_TILES + i0},${pz * PLATE_TILES + j0}`;
      const [fine, coarse] = [this.offsets[CELLS].get(tileKey), this.offsets[CHUNKS].get(tileKey)];
      if (!fine && !coarse && !plateMove) continue;
      const side = CORNERS + 2;
      const moves = [fine, coarse && smooth(coarse, side, 0, 0, 1 / CHUNK_CELLS, CELL_CORNERS), plateMove && smooth(plateMove, side, i0, j0, 1 / TILE_CELLS, CELL_CORNERS)];
      for (const move of moves) if (move) for (let k = 0; k < move.length; k++) cells.heights[k] += move[k];
    }
  }

  addPlatter(bytes) {
    const platter = decodePlatter(bytes);
    this.platters.set(platter.coords.join(","), platter);
  }

  addPlate(coords, bytes) {
    this.plateFiles.set(coords.join(","), bytes);
  }

  // Whether tile (tx, tz)'s ground at cell scale is ready, starting to read it when it isn't.
  hasCells(tx, tz) {
    const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
    if (!this.decoded.has(key)) this.read(key);
    return this.decoded.has(key);
  }

  // Starts reading plate file `key`, on a worker where there are workers.
  read(key) {
    if (this.reading.has(key) || this.unreadable.has(key)) return;
    if (!this.plateFiles.has(key)) {
      // Made by hand: nothing to read.
      if (this.made.has(key)) this.done({ key, plate: { coords: key.split(",").map(Number), palette: [], tiles: new Map() } });
      return;
    }
    this.reading.add(key);
    if (typeof Worker === "undefined") return this.done({ key, plate: decodePlate(this.plateFiles.get(key)) });
    this.startWorker();
    this.worker.postMessage({ key, bytes: this.plateFiles.get(key) });
  }

  done({ key, plate, error }) {
    this.reading.delete(key);
    if (error) {
      this.unreadable.add(key);
      console.error(`plate ${key} can't be read: ${error}`);
      return;
    }
    this.fill(key, plate);
    this.offset(key, plate);
    this.keep(key, plate);
    this.checkShores(key);
    this.onRead();
  }

  // Keeps a read plate file, the latest used last, dropping the least lately used past KEEP_PLATES.
  keep(key, plate) {
    this.decoded.delete(key);
    this.decoded.set(key, plate);
    if (this.decoded.size > KEEP_PLATES) this.decoded.delete(this.decoded.keys().next().value);
  }

  tile(tx, tz) {
    return this.platters.get(platterOf(tx, tz).join(","))?.tiles.get(indexIn(tx, tz)) ?? null;
  }

  plate(px, pz) {
    return this.platters.get(platterOfPlate(px, pz).join(","))?.plates.get(plateIndexIn(px, pz)) ?? null;
  }

  // A tile's ground at cell scale, { heights, terrain, biome, palette, and what it looks like
  // (dress) }, or null where it's not been read (starting to read it) or there's none.
  cells(tx, tz) {
    const key = `${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`;
    const plate = this.decoded.get(key);
    if (!plate) {
      this.read(key);
      return this.decoded.has(key) ? this.cells(tx, tz) : null;
    }
    this.keep(key, plate);
    const tile = plate.tiles.get(tileIndexInPlate(tx, tz));
    if (!tile) return null;
    tile.palette = plate.palette;
    this.dress(tx, tz, tile);
    return tile;
  }

  // Works out what tile (tx, tz)'s cells look like, from its heights, biomes and water, or where
  // it's been painted, that: `colors`, 64 × 64 sRGB, and `kinds`, indexes into look.js's PATTERNS.
  // Kept till its ground moves, the biomes change or its water does.
  dress(tx, tz, cells) {
    if (cells.dressed === this.looks && cells.dressedWater === cells.water) return;
    const biomes = this.biomeTile(tx, tz);
    const [near, runs] = this.nearWater(tx, tz, cells.water);
    const water = { wet: false, level: 0, type: 0, running: false };
    const colors = new Uint8Array(TILE_CELLS * TILE_CELLS * 3);
    const kinds = new Uint8Array(TILE_CELLS * TILE_CELLS);
    const h = cells.heights;
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const k = j * TILE_CELLS + i;
        const c = j * CELL_CORNERS + i;
        const [nw, ne, sw, se] = [h[c], h[c + 1], h[c + CELL_CORNERS], h[c + CELL_CORNERS + 1]];
        const [x, z] = [tx * TILE_FT + (i + 0.5) * CELL_FT, tz * TILE_FT + (j + 0.5) * CELL_FT];
        const paint = cells.terrain?.[k] ? cells.palette[cells.terrain[k] - 1] : null;
        const wet = cells.water && !Number.isNaN(cells.water.level[k]);
        Object.assign(water, wet ? { wet, level: cells.water.level[k], type: cells.water.type[k], running: RUNNING[cells.water.type[k]] } : { wet, level: near[k], running: !Number.isNaN(runs[k]) });
        const { pattern, rgb } = (paint && painted(paint, x, z)) || look(biomes[k], slopeOf(nw, ne, sw, se, CELL_FT), (nw + ne + sw + se) / 4, x, z, wet || !Number.isNaN(near[k]) ? water : null);
        kinds[k] = pattern;
        colors.set(rgb, k * 3);
      }
    }
    Object.assign(cells, { colors, kinds, dressed: this.looks, dressedWater: cells.water });
    delete cells.grid;
  }

  // The ground's height at continent feet (x, z), straight between cell corners, or chunk corners
  // where there are no cells or they've not been read, or null where there's no tile. It reads no
  // plate files.
  heightAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const cells = this.decoded.get(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`)?.tiles.get(tileIndexInPlate(tx, tz));
    if (cells) return between(this.pressedHeights(tx, tz, cells), CELL_CORNERS, (x - tx * TILE_FT) / CELL_FT, (z - tz * TILE_FT) / CELL_FT);
    const tile = this.tile(tx, tz);
    return tile && between(tile.heights, CORNERS, (x - tx * TILE_FT) / CHUNK_FT, (z - tz * TILE_FT) / CHUNK_FT);
  }

  // For each of tile (tx, tz)'s cells, the highest water within SHORE_CELLS of it, NaN for none,
  // and the highest running water's (look.js's RUNNING), with `water` the tile's, and its
  // neighbours' as waterCellAt has them: [levels, running levels].
  nearWater(tx, tz, water) {
    const r = SHORE_CELLS;
    const side = TILE_CELLS + 2 * r;
    const grid = new Float32Array(side * side).fill(NaN);
    const runs = new Float32Array(side * side).fill(NaN);
    const own = water && water.level.some((l) => !Number.isNaN(l));
    let any = own;
    for (let j = -r; j < TILE_CELLS + r; j++) {
      for (let i = -r; i < TILE_CELLS + r; i++) {
        const inside = i >= 0 && j >= 0 && i < TILE_CELLS && j < TILE_CELLS;
        if (inside && !own) continue;
        const k = j * TILE_CELLS + i;
        const [level, type] = inside ? [water.level[k], water.type[k]] : (this.waterCellAt(tx * TILE_FT + (i + 0.5) * CELL_FT, tz * TILE_FT + (j + 0.5) * CELL_FT) ?? [NaN, 0]);
        if (Number.isNaN(level)) continue;
        grid[(j + r) * side + i + r] = level;
        if (RUNNING[type]) runs[(j + r) * side + i + r] = level;
        any = true;
      }
    }
    if (!any) return [new Float32Array(TILE_CELLS * TILE_CELLS).fill(NaN), new Float32Array(TILE_CELLS * TILE_CELLS).fill(NaN)];
    // The highest along each row within r, then down each column.
    const most = (from, at, step, count) => {
      let best = NaN;
      for (let n = -count; n <= count; n++) {
        const v = from[at + n * step];
        if (!(v <= best)) best = Number.isNaN(v) ? best : v;
      }
      return best;
    };
    const spread = (from) => {
      const out = new Float32Array(TILE_CELLS * TILE_CELLS).fill(NaN);
      const rows = new Float32Array(side * side).fill(NaN);
      for (let j = 0; j < side; j++) for (let i = r; i < side - r; i++) rows[j * side + i] = most(from, j * side + i, 1, r);
      for (let j = 0; j < TILE_CELLS; j++) for (let i = 0; i < TILE_CELLS; i++) out[j * TILE_CELLS + i] = most(rows, (j + r) * side + i + r, side, r);
      return out;
    };
    return [spread(grid), spread(runs)];
  }

  // Whether there's sea at (x, z): off the tiles, or a cell's water that's the sea's.
  seaAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.tile(tx, tz)) return true;
    const water = this.decoded.get(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`)?.tiles.get(tileIndexInPlate(tx, tz))?.water;
    const k = Math.floor((z - tz * TILE_FT) / CELL_FT) * TILE_CELLS + Math.floor((x - tx * TILE_FT) / CELL_FT);
    return Boolean(water) && !Number.isNaN(water.level[k]) && water.type[k] === SEA;
  }

  // The water's surface at (x, z): the sea's off the tiles, a cell's water where its plate's read,
  // or null where it's dry or not read.
  waterAt(x, z) {
    return this.waterCellAt(x, z)?.[0] ?? null;
  }

  // The water at (x, z) as waterAt has it, [level, type (an index into WATER_TYPES)], or null.
  waterCellAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    if (!this.tile(tx, tz)) return [SEA_LEVEL_FT, SEA];
    const water = this.decoded.get(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`)?.tiles.get(tileIndexInPlate(tx, tz))?.water;
    if (!water) return null;
    const k = Math.floor((z - tz * TILE_FT) / CELL_FT) * TILE_CELLS + Math.floor((x - tx * TILE_FT) / CELL_FT);
    return Number.isNaN(water.level[k]) ? null : [water.level[k], water.type[k]];
  }

  // The middle of the tiles, as continent feet [x, z]: the tile nearest the middle of them all.
  middle() {
    const all = [];
    for (const { coords, tiles } of this.platters.values()) {
      for (const index of tiles.keys()) all.push([coords[0] * PLATTER_TILES + (index % PLATTER_TILES), coords[1] * PLATTER_TILES + Math.floor(index / PLATTER_TILES)]);
    }
    if (!all.length) return [0, 0];
    const mean = [0, 1].map((m) => all.reduce((s, t) => s + t[m], 0) / all.length);
    const [tx, tz] = all.reduce((best, t) => (Math.hypot(t[0] - mean[0], t[1] - mean[1]) < Math.hypot(best[0] - mean[0], best[1] - mean[1]) ? t : best));
    return [(tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT];
  }
}

// A value `t` of the way from p1 to p2, curved through p0 to p3 round them, never past p1 or p2
// where they're the highest or lowest round there (a monotone cubic), so a cliff gets no ditch at
// its foot or lip at its top.
function curve(p0, p1, p2, p3, t) {
  const [s0, s1, s2] = [p1 - p0, p2 - p1, p3 - p2];
  let m1 = s0 * s1 > 0 ? (s0 + s1) / 2 : 0;
  let m2 = s1 * s2 > 0 ? (s1 + s2) / 2 : 0;
  if (s1 !== 0) {
    const [a, b] = [m1 / s1, m2 / s1];
    const r = a * a + b * b;
    if (r > 9) [m1, m2] = [(3 * a * s1) / Math.sqrt(r), (3 * b * s1) / Math.sqrt(r)];
  }
  const [t2, t3] = [t * t, t * t * t];
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

// A `count` × `count` grid of values curved smoothly between a grid's corners, through each: from
// (u0, v0) in the grid's squares, `step` squares apart. The grid has `side` corners a row, a ring
// of them round its squares, so it curves the same across its edges as its neighbours do.
function smooth(grid, side, u0, v0, step, count) {
  const n = side - 3;
  const place = (u) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(u)));
    return [i, u - i];
  };
  const across = Array.from({ length: count }, (_, i) => place(u0 + i * step));
  // Each row of the grid curved across first, then those down.
  const rows = new Float32Array(side * count);
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < count; c++) {
      const [i, t] = across[c];
      const at = r * side + i;
      rows[r * count + c] = curve(grid[at], grid[at + 1], grid[at + 2], grid[at + 3], t);
    }
  }
  const out = new Float32Array(count * count);
  for (let k = 0; k < count; k++) {
    const [j, t] = place(v0 + k * step);
    for (let c = 0; c < count; c++) out[k * count + c] = curve(rows[j * count + c], rows[(j + 1) * count + c], rows[(j + 2) * count + c], rows[(j + 3) * count + c], t);
  }
  return out;
}

// A height straight between a grid's corners (`side` a row), at (u, v) in grid squares.
function between(heights, side, u, v) {
  const [i, j] = [Math.min(side - 2, Math.floor(u)), Math.min(side - 2, Math.floor(v))];
  const [fu, fv] = [u - i, v - j];
  const h = (a, b) => heights[(j + b) * side + i + a];
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * fu;
  const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * fu;
  return top + (bottom - top) * fv;
}

// Each sRGB byte's linear value.
const LINEAR = Float32Array.from({ length: 256 }, (_, v) => new THREE.Color().setRGB(v / 255, 0, 0, THREE.SRGBColorSpace).r);

// Triangles with a color each, gathered into a flat-shaded mesh's geometry. Flat shading works
// out its normals as it draws, so the geometry has none.
class Faces {
  constructor() {
    this.positions = new Float32Array(1 << 12);
    this.colors = new Float32Array(1 << 12);
    this.length = 0;
  }

  // An sRGB color from 0-255 bytes at `k`, darkened by `shade`, as linear RGB.
  rgb(bytes, k, shade = 1) {
    return [LINEAR[bytes[k]] * shade, LINEAR[bytes[k + 1]] * shade, LINEAR[bytes[k + 2]] * shade];
  }

  // `rgb` mixed toward `tint`'s color for biome `biome`, or as it is with no tint.
  static tinted(rgb, tint, biome) {
    if (!tint) return rgb;
    const color = tint[biome];
    return [0, 1, 2].map((m) => rgb[m] * (1 - TINT) + color[m] * TINT);
  }

  // A square from its corners: northwest, northeast, southwest, southeast.
  square(a, b, c, d, rgb) {
    this.add(a, rgb);
    this.add(c, rgb);
    this.add(b, rgb);
    this.add(b, rgb);
    this.add(c, rgb);
    this.add(d, rgb);
  }

  // A skirt hanging `depth` from the edge p to q.
  skirt(p, q, depth, rgb) {
    const [pd, qd] = [[p[0], p[1] - depth, p[2]], [q[0], q[1] - depth, q[2]]];
    this.square(p, q, pd, qd, rgb);
  }

  add(p, rgb) {
    this.room(3);
    const [at, positions, colors] = [this.length, this.positions, this.colors];
    positions[at] = p[0];
    positions[at + 1] = p[1];
    positions[at + 2] = p[2];
    colors[at] = rgb[0];
    colors[at + 1] = rgb[1];
    colors[at + 2] = rgb[2];
    this.length += 3;
  }

  // Another's faces, moved (ox, oz).
  append(other, ox, oz) {
    this.room(other.length);
    const at = this.length;
    this.positions.set(other.positions.subarray(0, other.length), at);
    this.colors.set(other.colors.subarray(0, other.length), at);
    for (let v = at; v < at + other.length; v += 3) {
      this.positions[v] += ox;
      this.positions[v + 2] += oz;
    }
    this.length += other.length;
  }

  room(more) {
    if (this.length + more <= this.positions.length) return;
    let size = this.positions.length * 2;
    while (size < this.length + more) size *= 2;
    for (const name of ["positions", "colors"]) {
      const grown = new Float32Array(size);
      grown.set(this[name]);
      this[name] = grown;
    }
  }

  // The geometry, or null with no faces.
  geometry() {
    if (!this.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions.slice(0, this.length), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors.slice(0, this.length), 3));
    return geometry;
  }
}

// How a tile is drawn, finest first: in full, flat at cell scale, from its rendition, or from its
// plate's.
export const FULL = 0;
export const FINE = 1;
export const COARSE = 2;
export const PLATE = 3;

// Each side of a tile: the tile beside it, and the side's two corners going clockwise seen from
// above, as [east, south] shares of the tile.
const SIDES = [
  [0, -1, [0, 0], [1, 0]],
  [1, 0, [1, 0], [1, 1]],
  [0, 1, [1, 1], [0, 1]],
  [-1, 0, [0, 1], [0, 0]],
];

// A tile's cells as one grid of vertices on their corners, in feet from its plate's northwest
// corner, the tile (ox, oz) feet from there, kept with the cells: each vertex the mean color of
// the cells round it, with normals for smooth shading; at `heights`, the cells' own or pressed
// (Renditions' pressedHeights).
function cellGrid(cells, ox, oz, heights = cells.heights) {
  if (cells.grid?.heights === heights) return cells.grid;
  const side = CELL_CORNERS;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const h = (i, j) => heights[Math.max(0, Math.min(side - 1, j)) * side + Math.max(0, Math.min(side - 1, i))];
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = (j * side + i) * 3;
      positions[v] = ox + i * CELL_FT;
      positions[v + 1] = h(i, j);
      positions[v + 2] = oz + j * CELL_FT;
      let count = 0;
      for (let b = Math.max(0, j - 1); b <= Math.min(TILE_CELLS - 1, j); b++) {
        for (let a = Math.max(0, i - 1); a <= Math.min(TILE_CELLS - 1, i); a++) {
          const k = (b * TILE_CELLS + a) * 3;
          for (let m = 0; m < 3; m++) colors[v + m] += LINEAR[cells.colors[k + m]];
          count++;
        }
      }
      for (let m = 0; m < 3; m++) colors[v + m] /= count;
      const [nx, nz] = [(h(i - 1, j) - h(i + 1, j)) / (2 * CELL_FT), (h(i, j - 1) - h(i, j + 1)) / (2 * CELL_FT)];
      const length = Math.hypot(nx, 1, nz);
      normals[v] = nx / length;
      normals[v + 1] = 1 / length;
      normals[v + 2] = nz / length;
    }
  }
  cells.grid = { position: positions, color: colors, normal: normals };
  Object.defineProperty(cells.grid, "heights", { value: heights }); // not an attribute
  return cells.grid;
}

// The squares of a cell grid, as indexes of its vertices, from `base` on.
function gridSquares(base, out = new Uint32Array(TILE_CELLS * TILE_CELLS * 6), at = 0) {
  const side = CELL_CORNERS;
  for (let b = 0; b < TILE_CELLS; b++) {
    for (let a = 0; a < TILE_CELLS; a++) {
      const nw = base + b * side + a;
      out[at] = nw;
      out[at + 1] = out[at + 4] = nw + side;
      out[at + 2] = out[at + 3] = nw + 1;
      out[at + 5] = nw + side + 1;
      at += 6;
    }
  }
  return out;
}
const SQUARES = gridSquares(0);
let plateSquares = null; // the squares of a plate's tiles' grids, one after another

// The tile-shaped stand-in groundMaterial wants for a tile's cells: the pattern at each cell's
// middle (Renditions' dress).
const NO_FOREST = new Uint8Array(TILE_CELLS * TILE_CELLS);
function groundTile(tx, tz, cells) {
  return { coords: [tx, tz], cells: TILE_CELLS, cellFt: CELL_FT, palettes: { terrain: PATTERNS }, layers: { terrain: cells.kinds, forest: NO_FOREST }, roads: [] };
}

// The meshes round the builder, a group for each plate within FAR_FT: when the builder leaves
// their tile, or a plate file's been read, each plate's tiles' tiers are worked out again (plan), and plates whose tiers
// changed are made again a few at a time, nearest first, within BUILD_MS a frame (build), each
// kept as it was until it's replaced.
export class Ground {
  constructor(scene, renditions, renderer) {
    this.renditions = renditions;
    // Tiles drawn coarser till their cells were read can now be drawn finer.
    renditions.onRead = () => (this.stale = true);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.renderer = renderer;
    // The flat-shaded ground's material by what it draws, each with the grid's squares that fine.
    const flat = (finest) => withGrid(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), finest);
    this.materials = { plate: flat(TILE_FT), tile: flat(CHUNK_FT), fine: flat(CELL_FT) };
    this.plates = new Map(); // "px,pz" -> a plate's group, its userData.tiers how its tiles are drawn
    this.wanted = new Map(); // "px,pz" -> how its tiles should be drawn, a digit each, "-" for none
    this.pending = []; // "px,pz" of plates to make, nearest first
    this.moved = new Set(); // "px,pz" of plates whose ground moved, made next frame whatever it takes
    this.anchor = null; // the builder's tile and height in tiles' widths, [tx, ty, tz]
    this.stale = false; // whether what's drawn wants working out again, wherever the builder is
    this.finest = FULL; // the finest tier drawn, by how high the builder is (finestAt)
    this.reach = FAR_FT; // how far off ground's drawn, by how high the builder is
    // Which kinds of ground are shown (toggle).
    this.shown = { full: true, fine: true, tile: true, plate: true, water: true };
    this.water = null; // the material water drawn from renditions is drawn with
    this.counts = [0, 0, 0, 0]; // tiles drawn each way
    this.tint = null; // showing biomes, each biome's linear RGB, by index into BIOME_NAMES
    this.tints = 0; // counts changes to how ground's tinted, to tell tinted faces kept are stale
  }

  // Draws all but the ground in full tinted by biome, with `tint` (each biome's linear RGB), or
  // not, with null.
  setTint(tint) {
    this.tint = tint;
    this.retint();
  }

  // Makes every plate again, a few a frame, for biomes that changed.
  retint() {
    this.tints++;
    for (const group of this.plates.values()) group.userData.tiers = null;
    this.stale = true;
  }

  // Works out what's to be drawn round continent feet (x, y, z) when that's left the tile it was
  // last worked out for, or the finest tier drawn there changes, then makes some of it.
  update(x, y, z) {
    const a = this.anchor;
    const out = (v, at) => v < at * TILE_FT - LEAVE_FT || v > (at + 1) * TILE_FT + LEAVE_FT;
    for (const key of this.renditions.wetPlates) {
      for (const group of [this.plates.get(key), this.plates.get(platterKeyOf(key))]) if (group) group.userData.tiers = null;
      this.stale = true;
    }
    this.renditions.wetPlates.clear();
    if (!a || this.stale || out(x, a[0]) || out(y, a[1]) || out(z, a[2]) || this.finestAt(x, y, z) !== this.finest) this.plan(x, y, z);
    this.build();
  }

  // The finest tier drawn with the builder at continent feet (x, y, z): none whose square is less
  // than twice as wide as the builder is high over the ground.
  finestAt(x, y, z) {
    const above = y - (this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT);
    const wide = (tiles) => (2 * tiles + 1) * TILE_FT;
    const finest = [FULL_TILES, FINE_TILES, COARSE_TILES].findIndex((tiles) => wide(tiles) > 2 * above);
    return finest < 0 ? PLATE : finest;
  }

  // How tile (tx, tz) is drawn, or null where it has no ground.
  tier(tx, tz) {
    const ys = span(this.renditions.tile(tx, tz));
    if (!ys) return null;
    const [ax, ay, az] = this.anchor;
    const [lo, hi] = [Math.floor(ys[0] / TILE_FT), Math.floor(ys[1] / TILE_FT)];
    const d = Math.max(Math.abs(tx - ax), Math.abs(tz - az), ay > hi ? ay - hi : ay < lo ? lo - ay : 0);
    let t = d > COARSE_TILES ? PLATE : d > FINE_TILES ? COARSE : d > FULL_TILES ? FINE : FULL;
    t = Math.max(t, this.finest);
    return t < COARSE && !this.renditions.hasCells(tx, tz) ? COARSE : t;
  }

  plan(x, y, z) {
    this.stale = false;
    this.anchor = [Math.floor(x / TILE_FT), Math.floor(y / TILE_FT), Math.floor(z / TILE_FT)];
    this.finest = this.finestAt(x, y, z);
    const [ax, , az] = this.anchor;
    const reach = Math.ceil(FAR_FT / PLATE_FT);
    const [cx, cz] = [Math.floor(x / PLATE_FT), Math.floor(z / PLATE_FT)];
    const wanted = new Map();
    const distance = new Map();
    for (let pz = cz - reach; pz <= cz + reach; pz++) {
      for (let px = cx - reach; px <= cx + reach; px++) {
        if (!this.renditions.plate(px, pz)) continue;
        const dx = x - Math.max(px * PLATE_FT, Math.min(x, (px + 1) * PLATE_FT));
        const dz = z - Math.max(pz * PLATE_FT, Math.min(z, (pz + 1) * PLATE_FT));
        if (Math.hypot(dx, dz) > FAR_FT) continue;
        const key = `${px},${pz}`;
        distance.set(key, Math.hypot(dx, dz));
        // A plate well clear of the builder's tile is drawn all from its rendition, but for the
        // skirts round tiles drawn finer beside it.
        const clear = (lo, at) => at < lo - COARSE_TILES - 1 || at > lo + PLATE_TILES + COARSE_TILES;
        if (clear(px * PLATE_TILES, ax) || clear(pz * PLATE_TILES, az)) {
          wanted.set(key, "far");
          continue;
        }
        let tiers = "";
        for (let j = -1; j <= PLATE_TILES; j++) for (let i = -1; i <= PLATE_TILES; i++) tiers += this.tier(px * PLATE_TILES + i, pz * PLATE_TILES + j) ?? "-";
        wanted.set(key, tiers);
      }
    }
    // Past FAR_FT, out to its reach, a platter's plates at a time, a 1 for each of its plates
    // drawn, row order.
    const high = Math.max(0, y - (this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT));
    this.reach = Math.min(REACH_FT, FAR_FT + REACH_PER_FT * high);
    const span = Math.ceil(this.reach / PLATTER_FT);
    const [qx, qz] = [Math.floor(x / PLATTER_FT), Math.floor(z / PLATTER_FT)];
    for (let ppz = qz - span; this.reach > FAR_FT && ppz <= qz + span; ppz++) {
      for (let ppx = qx - span; ppx <= qx + span; ppx++) {
        let [plates, nearest] = ["", Infinity];
        for (let j = 0; j < PLATTER_PLATES; j++) {
          for (let i = 0; i < PLATTER_PLATES; i++) {
            const [px, pz] = [ppx * PLATTER_PLATES + i, ppz * PLATTER_PLATES + j];
            const d = Math.hypot(x - Math.max(px * PLATE_FT, Math.min(x, (px + 1) * PLATE_FT)), z - Math.max(pz * PLATE_FT, Math.min(z, (pz + 1) * PLATE_FT)));
            const drawn = d > FAR_FT && d <= this.reach && Boolean(this.renditions.plate(px, pz));
            plates += drawn ? "1" : "0";
            if (drawn) nearest = Math.min(nearest, d);
          }
        }
        if (nearest === Infinity) continue;
        const key = `platter:${ppx},${ppz}`;
        wanted.set(key, plates);
        distance.set(key, nearest);
      }
    }
    this.wanted = wanted;
    for (const key of [...this.plates.keys()]) if (!wanted.has(key)) this.drop(key);
    this.pending = [...wanted].filter(([key, tiers]) => this.plates.get(key)?.userData.tiers !== tiers).map(([key]) => key);
    this.pending.sort((a, b) => distance.get(a) - distance.get(b));
  }

  // Makes the plates waiting to be made, nearest first, for up to BUILD_MS.
  build() {
    const start = performance.now();
    while (this.pending.length && (this.moved.has(this.pending[0]) || performance.now() - start < BUILD_MS)) {
      const key = this.pending.shift();
      this.moved.delete(key);
      const made = this.makePlate(key, this.wanted.get(key));
      this.drop(key);
      this.group.add(made);
      this.plates.set(key, made);
    }
    this.counts = [0, 0, 0, 0];
    for (const group of this.plates.values()) group.userData.counts.forEach((n, t) => (this.counts[t] += n));
  }

  // A plate's group, its tiles drawn as `tiers` says: for the plate's tiles and a ring of tiles
  // round them, a tier each, row order, "-" for none, or "far" for every tile from the plate's
  // rendition.
  makePlate(key, tiers) {
    if (key.startsWith("platter:")) return this.makePlatter(key, tiers);
    const [px, pz] = key.split(",").map(Number);
    const plate = this.renditions.plate(px, pz);
    const side = PLATE_TILES + 2;
    const tierAt = (i, j) => {
      if (tiers === "far") return this.renditions.tile(px * PLATE_TILES + i, pz * PLATE_TILES + j) ? PLATE : null;
      const t = tiers[(j + 1) * side + i + 1];
      return t === "-" ? null : Number(t);
    };
    const group = new THREE.Group();
    group.position.set(px * PLATE_FT, 0, pz * PLATE_FT);
    group.userData = { tiers, counts: [0, 0, 0, 0] };
    const far = new Faces(); // PLATE tiles and their skirts
    const near = new Faces(); // COARSE tiles, and every finer tile's skirts
    const fine = []; // [i, j, cells] of FINE tiles
    const water = { positions: [], depths: [], colors: [] }; // the water of tiles drawn from renditions
    // The tiles in full the plate had, to keep those still drawn in full.
    const before = new Map();
    for (const mesh of this.plates.get(key)?.children ?? []) if (mesh.userData.kind === "full") before.set(mesh.userData.tile, mesh);
    for (let j = 0; j < PLATE_TILES; j++) {
      for (let i = 0; i < PLATE_TILES; i++) {
        const [tx, tz] = [px * PLATE_TILES + i, pz * PLATE_TILES + j];
        let t = tierAt(i, j);
        if (t === null) continue;
        const cells = t < COARSE && this.renditions.cells(tx, tz);
        if (t < COARSE && !cells) t = COARSE;
        group.userData.counts[t]++;
        const [ox, oz] = [i * TILE_FT, j * TILE_FT];
        // The tile's ground as a grid of `n` parts a side: the height at corner (a, b), and part
        // (a, b)'s color, darkened by `shade`.
        let n, height, color, faces, depth;
        const tint = this.tint;
        if (t === PLATE) {
          [n, faces, depth] = [1, far, TILE_FT * SKIRT];
          height = (a, b) => plate.heights[(j + b) * CORNERS + i + a];
          const biome = this.renditions.biomes.at((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT);
          const rgb = this.partRgb(biome, height, 0, 0, 1, TILE_FT, tx * TILE_FT, tz * TILE_FT, tileWater(this.renditions.tile(tx, tz)));
          color = (a, b, shade) => Faces.tinted(rgb.map((v) => v * shade), tint, biome);
        } else if (t === COARSE) {
          const tile = this.renditions.tile(tx, tz);
          [n, faces, depth] = [TILE_CHUNKS, near, CHUNK_FT * SKIRT];
          height = (a, b) => tile.heights[b * CORNERS + a];
          const biomes = this.renditions.biomeTile(tx, tz);
          color = (a, b, shade) => {
            const biome = biomes[(b * CHUNK_CELLS + CHUNK_CELLS_HALF) * TILE_CELLS + a * CHUNK_CELLS + CHUNK_CELLS_HALF];
            return Faces.tinted(this.partRgb(biome, height, a, b, 1, CHUNK_FT, tx * TILE_FT, tz * TILE_FT, partWaterAt(tile, a, b)).map((v) => v * shade), tint, biome);
          };
        } else {
          [n, faces, depth] = [TILE_CELLS, near, CHUNK_FT * SKIRT];
          const heights = this.renditions.pressedHeights(tx, tz, cells);
          height = (a, b) => heights[b * CELL_CORNERS + a];
          const biomes = tint && t === FINE && this.renditions.biomeTile(tx, tz);
          color = (a, b, shade) => Faces.tinted(near.rgb(cells.colors, (b * TILE_CELLS + a) * 3, shade), biomes && tint, biomes && biomes[b * TILE_CELLS + a]);
          if (t === FINE) fine.push(biomes ? this.tintedGrid(cells, ox, oz, biomes, heights) : cellGrid(cells, ox, oz, heights));
          else this.addFull(group, tx, tz, cells, ox, oz, before, heights);
        }
        const part = TILE_FT / n;
        const corner = (a, b) => [ox + a * part, height(a, b), oz + b * part];
        if (t === PLATE) faces.square(corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1), color(0, 0, 1));
        if (t >= COARSE) {
          const tile = this.renditions.tile(tx, tz);
          // Where the plate's rendition draws the ground, `u` and `v` 0 to 1 across the tile.
          const drawn = t === PLATE && ((u, v) => (1 - v) * ((1 - u) * height(0, 0) + u * height(1, 0)) + v * ((1 - u) * height(0, 1) + u * height(1, 1)));
          if (tile.water) addWater(water, tile, ox, oz, drawn);
        }
        if (t === COARSE) faces.append(this.tileFaces(tx, tz), ox, oz);
        for (const [di, dj, from, to] of SIDES) {
          if (tierAt(i + di, j + dj) === t) continue;
          const step = [to[0] - from[0], to[1] - from[1]];
          for (let k = 0; k < n; k++) {
            const p = [from[0] * n + step[0] * k, from[1] * n + step[1] * k];
            const q = [p[0] + step[0], p[1] + step[1]];
            const cell = [Math.min(p[0], q[0]) - (di > 0 ? 1 : 0), Math.min(p[1], q[1]) - (dj > 0 ? 1 : 0)];
            faces.skirt(corner(...p), corner(...q), depth, color(...cell, SKIRT_SHADE));
          }
        }
      }
    }
    this.add(group, far.geometry(), this.materials.plate, "plate");
    this.add(group, near.geometry(), this.materials.tile, "tile");
    this.add(group, fineGeometry(fine), this.materials.fine, "fine");
    if (water.positions.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(water.positions, 3));
      g.setAttribute("depth", new THREE.Float32BufferAttribute(water.depths, 1));
      g.setAttribute("color", new THREE.Float32BufferAttribute(water.colors, 3));
      g.setAttribute("flow", new THREE.Float32BufferAttribute(new Float32Array(water.positions.length), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from({ length: water.positions.length }, (_, n) => (n % 3 === 1 ? 1 : 0)), 3));
      if (!this.water) {
        this.water = waterMaterial(this.renderer, { color: 0xffffff, opacity: 0.88, shoreFadeFt: SHORE_FADE_FT });
        this.water.vertexColors = true;
      }
      this.add(group, g, this.water, "water").renderOrder = 1;
    }
    return group;
  }

  // The plates of platter `key`, "platter:ppx,ppz", that `plates` has a 1 for, as one mesh, from
  // their renditions, a part a tile, with skirts round them.
  makePlatter(key, plates) {
    const [ppx, ppz] = key.slice("platter:".length).split(",").map(Number);
    const group = new THREE.Group();
    group.position.set(ppx * PLATTER_FT, 0, ppz * PLATTER_FT);
    group.userData = { tiers: plates, counts: [0, 0, 0, 0] };
    const faces = new Faces();
    const [tx0, tz0] = [ppx * PLATTER_TILES, ppz * PLATTER_TILES];
    // Whether tile (i, j) of the platter's drawn here.
    const drawn = (i, j) =>
      i >= 0 && j >= 0 && i < PLATTER_TILES && j < PLATTER_TILES && plates[Math.floor(j / PLATE_TILES) * PLATTER_PLATES + Math.floor(i / PLATE_TILES)] === "1" && Boolean(this.renditions.tile(tx0 + i, tz0 + j));
    for (let j = 0; j < PLATTER_TILES; j++) {
      for (let i = 0; i < PLATTER_TILES; i++) {
        if (!drawn(i, j)) continue;
        const [tx, tz] = [tx0 + i, tz0 + j];
        const plate = this.renditions.plate(Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES));
        const [pi, pj] = [i % PLATE_TILES, j % PLATE_TILES];
        const height = (a, b) => plate.heights[(pj + b) * CORNERS + pi + a];
        const biome = this.renditions.biomes.at((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT);
        const rgb = this.partRgb(biome, height, 0, 0, 1, TILE_FT, tx * TILE_FT, tz * TILE_FT, tileWater(this.renditions.tile(tx, tz)));
        const color = (shade) => Faces.tinted(rgb.map((v) => v * shade), this.tint, biome);
        const corner = (a, b) => [(i + a) * TILE_FT, height(a, b), (j + b) * TILE_FT];
        faces.square(corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1), color(1));
        group.userData.counts[PLATE]++;
        for (const [di, dj, from, to] of SIDES) if (!drawn(i + di, j + dj)) faces.skirt(corner(...from), corner(...to), TILE_FT * SKIRT, color(SKIRT_SHADE));
      }
    }
    this.add(group, faces.geometry(), this.materials.plate, "plate");
    return group;
  }

  // The linear RGB of the part (a, b) of a rendition, `n` corners a side apart in height(a, b),
  // the part `width` ft across, its rendition's corner at (x0, z0): the look of biome `biome` there,
  // with `water` on or near it as look.js's groundClass has it.
  partRgb(biome, height, a, b, n, width, x0, z0, water = null) {
    const [nw, ne, sw, se] = [height(a, b), height(a + n, b), height(a, b + n), height(a + n, b + n)];
    const { rgb } = look(biome, slopeOf(nw, ne, sw, se, width), (nw + ne + sw + se) / 4, x0 + (a + 0.5) * width, z0 + (b + 0.5) * width, water);
    return [LINEAR[rgb[0]], LINEAR[rgb[1]], LINEAR[rgb[2]]];
  }

  // A tile's rendition's squares, in feet from its northwest corner, in their biomes' looks, tinted
  // when biomes are shown, kept with it till its ground moves or how it looks changes.
  tileFaces(tx, tz) {
    const tile = this.renditions.tile(tx, tz);
    const key = `${this.renditions.looks},${this.tint ? this.tints : -1}`;
    if (tile.faces?.key === key && tile.faces.water === tile.water) return tile.faces;
    const biomes = this.renditions.biomeTile(tx, tz);
    const height = (a, b) => tile.heights[b * CORNERS + a];
    const faces = new Faces();
    const corner = (a, b) => [a * CHUNK_FT, height(a, b), b * CHUNK_FT];
    for (let b = 0; b < TILE_CHUNKS; b++) {
      for (let a = 0; a < TILE_CHUNKS; a++) {
        const biome = biomes[(b * CHUNK_CELLS + CHUNK_CELLS_HALF) * TILE_CELLS + a * CHUNK_CELLS + CHUNK_CELLS_HALF];
        const rgb = Faces.tinted(this.partRgb(biome, height, a, b, 1, CHUNK_FT, tx * TILE_FT, tz * TILE_FT, partWaterAt(tile, a, b)), this.tint, biome);
        faces.square(corner(a, b), corner(a + 1, b), corner(a, b + 1), corner(a + 1, b + 1), rgb);
      }
    }
    faces.key = key;
    faces.water = tile.water;
    tile.faces = faces;
    return faces;
  }

  // A tile's cell grid with its colors tinted by `biomes`, its cells' biomes, each corner by the
  // cells round it, kept with its cells till the tint changes.
  tintedGrid(cells, ox, oz, biomes, heights) {
    const grid = cellGrid(cells, ox, oz, heights);
    if (cells.tinted?.tints === this.tints && cells.tinted.grid === grid) return cells.tinted.tinted;
    const side = CELL_CORNERS;
    const color = new Float32Array(grid.color.length);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = (j * side + i) * 3;
        const mixed = [0, 0, 0];
        let count = 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(TILE_CELLS - 1, j); b++) {
          for (let a = Math.max(0, i - 1); a <= Math.min(TILE_CELLS - 1, i); a++) {
            const c = this.tint[biomes[b * TILE_CELLS + a]];
            for (let m = 0; m < 3; m++) mixed[m] += c[m];
            count++;
          }
        }
        for (let m = 0; m < 3; m++) color[v + m] = grid.color[v + m] * (1 - TINT) + (mixed[m] / count) * TINT;
      }
    }
    const tinted = { ...grid, color };
    cells.tinted = { tints: this.tints, grid, tinted };
    return tinted;
  }

  // A tile drawn in full into a plate's group, (ox, oz) feet into it: the mesh from `before`
  // ("tx,tz" -> mesh) when it's there.
  addFull(group, tx, tz, cells, ox, oz, before, heights) {
    const grid = cellGrid(cells, ox, oz, heights);
    const geometry = () => {
      const made = new THREE.BufferGeometry();
      for (const [name, values] of Object.entries(grid)) made.setAttribute(name, new THREE.BufferAttribute(values, 3));
      made.setIndex(new THREE.BufferAttribute(SQUARES, 1));
      return made;
    };
    const kept = before.get(`${tx},${tz}`);
    if (kept) {
      group.add(kept);
      // Moved ground, or ground that looks different: its new shape, and its patterns again.
      if (kept.userData.grid !== grid) {
        kept.geometry.dispose();
        kept.geometry = geometry();
        kept.userData.grid = grid;
        disposeGround(kept.material);
        kept.material = withGrid(groundMaterial(this.renderer, { tile: groundTile(tx, tz, cells), origin: [0, 0] }), CELL_FT);
      }
      return;
    }
    const mesh = this.add(group, geometry(), withGrid(groundMaterial(this.renderer, { tile: groundTile(tx, tz, cells), origin: [0, 0] }), CELL_FT), "full");
    mesh.userData.tile = `${tx},${tz}`;
    mesh.userData.grid = grid;
  }

  add(group, geometry, material, kind) {
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kind = kind;
    mesh.visible = this.shown[kind];
    group.add(mesh);
    return mesh;
  }

  // Makes plates ("px,pz") again next frame, for ground that's moved: all of them, so ground
  // moved either side of a plate's edge shows moving together.
  refresh(keys) {
    // Plates made where there were none are worked into what's drawn.
    if ([...keys].some((key) => !this.wanted.has(key) && !this.wanted.has(platterKeyOf(key)))) this.stale = true;
    const again = [...new Set([...keys].flatMap((key) => [key, platterKeyOf(key)]))].filter((key) => this.wanted.has(key));
    for (const key of again) {
      const group = this.plates.get(key);
      if (group) group.userData.tiers = null;
      this.moved.add(key);
    }
    this.pending = [...again, ...this.pending.filter((key) => !again.includes(key))];
  }

  // Shows or hides one kind of ground: "full", "fine" (tiles at cell scale), "tile" (tiles'
  // renditions, with the skirts) or "plate", wherever it's drawn.
  toggle(kind) {
    this.shown[kind] = !this.shown[kind];
    this.group.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.kind === kind) mesh.visible = this.shown[kind];
    });
  }

  drop(key) {
    const object = this.plates.get(key);
    if (!object) return;
    this.group.remove(object);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (mesh.userData.kind === "full") disposeGround(mesh.material);
    });
    this.plates.delete(key);
  }
}

// The water on or near part (a, b) of tile rendition `tile`, as look.js's groundClass has it: the
// part's own, or the highest of the parts round it in the tile, or null.
function partWaterAt({ water }, a, b) {
  if (!water) return null;
  const n = TILE_CHUNKS;
  const k = b * n + a;
  if (!Number.isNaN(water.level[k])) return { wet: true, level: water.level[k], type: water.type[k] };
  let level = -Infinity;
  for (let j = Math.max(0, b - 1); j <= Math.min(n - 1, b + 1); j++) for (let i = Math.max(0, a - 1); i <= Math.min(n - 1, a + 1); i++) if (water.level[j * n + i] > level) level = water.level[j * n + i];
  return level > -Infinity ? { wet: false, level } : null;
}

// The same for a whole tile: wet where most of its parts are, of the type most of them are.
function tileWater(tile) {
  const water = tile?.water;
  if (!water) return null;
  const counts = new Map();
  let [wet, level] = [0, -Infinity];
  water.level.forEach((l, k) => {
    if (Number.isNaN(l)) return;
    wet++;
    level = Math.max(level, l);
    counts.set(water.type[k], (counts.get(water.type[k]) ?? 0) + 1);
  });
  if (!wet) return null;
  const type = [...counts].reduce((best, c) => (c[1] > best[1] ? c : best))[0];
  return { wet: wet * 2 >= water.level.length, level, type };
}

// The key a plate's drawn under past FAR_FT: its platter's.
const platterKeyOf = (key) => `platter:${platterOfPlate(...key.split(",").map(Number)).join(",")}`;

// Each side of a plate, and how far the plate past it is.
const PLATE_SIDES = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };
const SEA = WATER_TYPES.indexOf("sea");
const PART_COLORS = WATER_TYPES.map((type) => new THREE.Color(WATER_LOOKS[type].color).toArray());
const LIFT_FT = 1; // how far over the ground drawn from a plate's rendition its water's lifted

// Adds the water of `tile`'s rendition (as platter.js has it) to `out`, but the sea: each wet part,
// and a part more round them at the level of the water next to it, the tile's corner at (ox, oz).
// With `drawn(u, v)`, where the ground's drawn across the tile, the water's lifted over it.
function addWater(out, { heights, water }, ox, oz, drawn) {
  const n = TILE_CHUNKS;
  const at = (a, b) => (a < 0 || b < 0 || a >= n || b >= n || water.type[b * n + a] === SEA ? NaN : water.level[b * n + a]);
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      let [level, kind] = [at(a, b), water.type[b * n + a]];
      if (Number.isNaN(level)) {
        for (let db = -1; db <= 1; db++) {
          for (let da = -1; da <= 1; da++) {
            const l = at(a + da, b + db);
            if (!Number.isNaN(l) && !(l <= level)) [level, kind] = [l, water.type[(b + db) * n + a + da]];
          }
        }
      }
      if (Number.isNaN(level)) continue;
      const corner = (ca, cb) => {
        const y = drawn ? Math.max(level, drawn(ca / n, cb / n) + LIFT_FT) : level;
        out.positions.push(ox + ca * CHUNK_FT, y, oz + cb * CHUNK_FT);
        out.depths.push(level - heights[cb * CORNERS + ca]);
        out.colors.push(...PART_COLORS[kind]);
      };
      for (const [ca, cb] of [[a, b], [a, b + 1], [a + 1, b], [a + 1, b], [a, b + 1], [a + 1, b + 1]]) corner(ca, cb);
    }
  }
}

// The cell grids of the tiles drawn flat at cell scale in a plate, as one geometry, or null for
// none.
function fineGeometry(grids) {
  if (!grids.length) return null;
  const count = CELL_CORNERS * CELL_CORNERS * 3;
  const positions = new Float32Array(grids.length * count);
  const colors = new Float32Array(grids.length * count);
  grids.forEach((grid, n) => {
    positions.set(grid.position, n * count);
    colors.set(grid.color, n * count);
  });
  if (!plateSquares) {
    plateSquares = new Uint32Array(PLATE_TILES * PLATE_TILES * SQUARES.length);
    for (let n = 0; n < PLATE_TILES * PLATE_TILES; n++) gridSquares((n * count) / 3, plateSquares, n * SQUARES.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(plateSquares.subarray(0, grids.length * SQUARES.length), 1));
  return geometry;
}

// The lowest and highest of a rendition's heights, or null for none.
function span(rendition) {
  if (!rendition) return null;
  rendition.span ??= [Math.min(...rendition.heights), Math.max(...rendition.heights)];
  return rendition.span;
}
