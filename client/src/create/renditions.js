import { BiomeMap, bakePlate, changedBoxes } from "../v2/biomes.js";
import { ACROSS, AROUND, WATER_TYPES, WaterMap, bakeWater, changedWaterBoxes, missingSea, partWater, seaEdges } from "../v2/water.js";
import { courseBox, poolsIn } from "../v2/courses.js";
import { shapedAt } from "../v2/shaping.js";
import { changedRoadBoxes, roadBox, roadKindAt } from "../v2/roads.js";
import { PATTERNS, RUNNING, look, painted, slopeOf } from "../v2/look.js";
import { CELL_CORNERS, TILE_CELLS, decodePlate, encodePlate, platePath, tileIndexInPlate } from "../v2/plate.js";
import { loadZipper } from "../v2/zstd.js";
import { CORNERS, decodePlatter, encodePlatter, indexIn, plateIndexIn, platterOf, platterOfPlate, platterPath } from "../v2/platter.js";
import { CELL_FT, CHUNK_CELLS, CHUNK_FT, PLATE_FT, PLATE_TILES, PLATTER_TILES, SEA_LEVEL_FT, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";
import { CELLS, CHUNKS, TILES } from "./geo.js";
import { EMPTY_FT, applyEdits, bakedPlate, fileTiles, plateEdges, smooth } from "./plateEdits.js";
import { pressHeights, pressedCorners } from "./press.js";

const KEEP_PLATES = 40; // plate files kept decoded
const FETCH_AGAIN_MS = 5000; // how long after a plate file couldn't be fetched it's tried again, if it's still wanted
const NOTHING_COVERED = new Set();
const SHORE_CELLS = 4; // how far from water ground can be shore

const PLATE_SIDES = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };
const SEA = WATER_TYPES.indexOf("sea");

// A continent's renditions, from its platter files, and its ground at cell scale, from its plate
// files, read on a worker (plateWorker.js) as they're wanted. onRead(key) is called each time a
// plate file ("px,pz") has been read. The ground moved by hand (raise) is moved in the renditions and the plate
// files read, and kept as offsets, to move plate files read later. Where there are no tiles, the
// sea floor's flat at EMPTY_FT, and moving it makes tiles there.
export class Renditions {
  constructor() {
    this.platters = new Map(); // "px,pz" -> { coords, tiles, plates }
    this.held = new Map(); // "px,pz" -> a platter file not read yet (holdPlatter)
    this.plateFiles = new Map(); // "px,pz" -> gzipped bytes
    this.decoded = new Map(); // "px,pz" -> decoded plate file, the latest used last
    this.reading = new Set(); // "px,pz" of plate files being read
    this.unreadable = new Set(); // "px,pz" of plate files that couldn't be read
    this.unfetched = new Map(); // "px,pz" -> when its plate file last couldn't be fetched
    this.onWorker = new Set(); // "px,pz" of plate files the worker's reading
    this.worker = null; // reads plates to draw
    this.saver = null; // writes files, so a big save doesn't hold up what's being drawn
    this.nextWrite = 1;
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
    this.roadFile = { roads: [] }; // the roads, as roads.json keeps them
    this.roadsVersion = 0; // counts changes to them, to tell when tiles drawn in full draw them again
    this.cuts = new Map(); // "tx,tz" -> how far courses and roads moved the tile's corners, over what its plate file has
    this.roadCells = new Map(); // "tx,tz" -> the tile's cells' road kinds as last carved, over what its plate file has
    this.waters = new Map(); // "tx,tz" -> the tile's water as last baked, over what its plate file has
    this.fileEdges = new Map(); // "px,pz" -> the sea along its sides as its file has it, for plates not read here
    this.wet = 0; // counts changes to tiles' water
    this.wetPlates = new Set(); // "px,pz" of plates whose renditions' water changed, to draw again
    // What presses tile (tx, tz)'s ground down where it's drawn and walked on (press.js), as
    // pressesOver() has it, or null for none; and a count of changes to that.
    this.pressesOver = null;
    this.pressings = 0;
    // fetchPlate(coords): a plate file's bytes, or null for none, for plate files fetched as
    // they're wanted rather than added beforehand (addPlate); or null.
    this.fetchPlate = null;
  }

  // Tile (tx, tz)'s cell corners' heights as they're drawn and walked on: `cells.heights`, pressed
  // down by slabs (press.js). Kept with the cells, the same array till what presses it changes.
  pressedHeights(tx, tz, cells) {
    if (!this.pressesOver) return cells.heights;
    if (cells.press?.count === this.pressings) return cells.press.heights;
    const presses = this.pressesOver(tx, tz);
    const key = presses.length ? JSON.stringify(presses) : "";
    if (cells.press?.key !== key) {
      const pressed = pressedCorners(presses, tx, tz);
      cells.press = { key, heights: pressHeights(cells.heights, pressed.corners), covered: pressed.cells };
    }
    cells.press.count = this.pressings;
    return cells.press.heights;
  }

  // The indexes of tile (tx, tz)'s cells that slabs cover (press.js), where nothing grows.
  coveredCells(tx, tz, cells) {
    this.pressedHeights(tx, tz, cells);
    return cells.press?.covered ?? NOTHING_COVERED;
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
    this.tellWorkers({ biomes: areas });
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
    this.tellWorkers({ water: file });
    if (!dirty) return new Set();
    const moved = this.carve(courses);
    return new Set([...moved, ...this.markBoxes(boxes)]);
  }

  // Takes the roads, { roads } as roads.json keeps them, and with `dirty`, carves those that changed
  // into the ground. Gives the "px,pz" of the plates moved.
  setRoads(file, dirty = true) {
    const boxes = changedRoadBoxes(this.roadFile, file);
    this.roadFile = file;
    this.roadsVersion++;
    return dirty ? this.carve(boxes) : new Set();
  }

  // Carves the courses and roads into the ground within `boxes` ([x0, z0, x1, z1]): each cell
  // corner there put back by what they moved it before, then put where they have it
  // (v2/shaping.js), and how far kept with its cells. Gives the "px,pz" of the plates moved.
  carve(boxes) {
    const moved = new Set();
    const roadsMoved = new Set(); // "px,pz" of plates whose road cells were worked out again
    const overlaps = (b, [x0, z0, x1, z1]) => b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;
    for (const box of boxes) {
      const [x0, z0, x1, z1] = box;
      const near = (this.waterFile.courses ?? []).filter((course) => course.surface?.length && overlaps(courseBox(course), box));
      const roads = (this.roadFile.roads ?? []).filter((road) => road.bed?.length && overlaps(roadBox(road), box));
      const pools = roads.length ? poolsIn(near, box) : [];
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
              const top = shapedAt(x, z, base, near, roads, pools);
              cut[k] = base - top;
              if (top !== tile.heights[k]) deltas.set(`${tx * TILE_CELLS + i},${tz * TILE_CELLS + j}`, top - tile.heights[k]);
            }
          }
          tile.cut = cut.some((v) => v) ? cut : null;
          this.cuts.set(`${tx},${tz}`, tile.cut);
          // Which of its cells in the box are on a road.
          const road = tile.road ?? new Uint8Array(TILE_CELLS * TILE_CELLS);
          for (let j = 0; j < TILE_CELLS; j++) {
            const z = tz * TILE_FT + (j + 0.5) * CELL_FT;
            if (z < z0 || z > z1) continue;
            for (let i = 0; i < TILE_CELLS; i++) {
              const x = tx * TILE_FT + (i + 0.5) * CELL_FT;
              if (x >= x0 && x <= x1) road[j * TILE_CELLS + i] = roads.length ? roadKindAt(roads, x, z) : 0;
            }
          }
          const roaded = road.some((v) => v) ? road : null;
          if (roaded !== tile.road || roaded) {
            tile.road = roaded;
            this.roadCells.set(`${tx},${tz}`, roaded);
            roadsMoved.add(key);
          }
        }
      }
      if (!deltas.size) continue;
      const at = (x, z) => deltas.get(`${Math.round(x / CELL_FT)},${Math.round(z / CELL_FT)}`) ?? 0;
      for (const key of this.raise(at, [x0, z0, x1, z1], CELLS, false)) moved.add(key);
    }
    // Plates whose road cells changed are saved again, though their ground may not have moved.
    for (const key of roadsMoved) {
      this.changed.add(key);
      this.unsaved.add(key);
      moved.add(key);
    }
    return moved;
  }

  // The ground at (x, z) as it was before courses and roads moved it, where its cells are read, else as
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
    this.fileEdges.delete(`${px},${pz}`);
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
        this.fileEdges.delete(key);
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

  // What's been done to plate `key` since its file was written, for applyEdits(): which tiles were
  // cleared and made, and each tile's water as last baked, cuts and roads as last carved and moves. A copy
  // of this goes with a plate to the worker that saves it.
  editsFor(key) {
    const [px, pz] = key.split(",").map(Number);
    const tiles = new Map();
    for (let index = 0; index < PLATE_TILES * PLATE_TILES; index++) {
      const tile = `${px * PLATE_TILES + (index % PLATE_TILES)},${pz * PLATE_TILES + Math.floor(index / PLATE_TILES)}`;
      const edit = { water: this.waters.get(tile), cut: this.cuts.get(tile), road: this.roadCells.get(tile), fine: this.offsets[CELLS].get(tile), coarse: this.offsets[CHUNKS].get(tile) };
      if (Object.values(edit).some((value) => value !== undefined)) tiles.set(index, edit);
    }
    return { cleared: this.cleared.get(key), made: this.made.get(key), tiles, plateMove: this.offsets[TILES].get(key) };
  }

  // Plate `key` read now, its made tiles and moves in, or null where it has no ground.
  readNow(key) {
    const [px, pz] = key.split(",").map(Number);
    const plate = this.plateFiles.has(key) ? decodePlate(this.plateFiles.get(key)) : this.made.has(key) ? { coords: [px, pz], palette: [], tiles: new Map() } : null;
    if (!plate) return null;
    return applyEdits(key, plate, this.editsFor(key));
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
    await this.readEdges(keys);
    for (const key of keys) {
      const [px, pz] = key.split(",").map(Number);
      platters.add(platterOfPlate(px, pz).join(","));
      const place = { coords: [px, pz], around: this.around(px, pz), shores: this.shores(px, pz) };
      const plate = this.decoded.get(key);
      const hasFile = this.plateFiles.has(key) || this.made.has(key);
      if (plate ? !plate.tiles.size : !hasFile) {
        files.set(platePath(continent, [px, pz]), null);
        continue;
      }
      // A plate not read here goes as its file and edits, for the worker to read. One read here
      // goes as only what the file holds, not what's kept for drawing.
      const value = plate ? { ...place, palette: plate.palette, tiles: fileTiles(plate.tiles) } : { ...place, bytes: this.plateFiles.get(key), edits: this.editsFor(key) };
      writing.push(this.write("plate", value).then((bytes) => files.set(platePath(continent, [px, pz]), bytes)));
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
        const { bytes, waters } = bakedPlate(value, this.biomes, this.water);
        if (waters) this.baked(value.coords, waters);
        return bytes;
      });
    }
    return this.ask({ write: kind, value }).then(({ bytes, waters }) => {
      if (waters) this.baked(value.coords, waters);
      return bytes;
    });
  }

  // Sends the saving worker a message, and gives its answer.
  ask(message) {
    this.startSaver();
    const id = this.nextWrite++;
    return new Promise((resolve, reject) => {
      this.writes.set(id, (answer) => (answer.error ? reject(new Error(answer.error)) : resolve(answer)));
      this.saver.postMessage({ ...message, id });
    });
  }

  // Finds the sea along the sides of plates `keys` and the plates next to them, where it's not
  // known, from their files on the worker. Saving these plates needs it.
  async readEdges(keys) {
    const wanted = new Set();
    const want = (px, pz) => {
      const key = `${px},${pz}`;
      if ((this.plateFiles.has(key) || this.made.has(key)) && !this.edges(px, pz)) wanted.add(key);
    };
    for (const key of keys) {
      const [px, pz] = key.split(",").map(Number);
      want(px, pz);
      for (const [dx, dz] of Object.values(PLATE_SIDES)) want(px + dx, pz + dz);
    }
    await Promise.all(
      [...wanted].map(async (key) => {
        const value = { coords: key.split(",").map(Number), bytes: this.plateFiles.get(key), edits: { cleared: this.cleared.get(key), made: this.made.get(key) } };
        const edges = typeof Worker === "undefined" ? plateEdges(value) : (await this.ask({ edgesOf: value })).edges;
        this.fileEdges.set(key, edges);
      }),
    );
  }

  // Takes the water baked into plate (px, pz)'s tiles, [index, water, its parts' water if it's
  // been worked out], to draw, and into their renditions. Where its sea along a side's changed, the plate past that side's to be saved
  // again, to take the sea in from it.
  baked([px, pz], waters) {
    const plate = this.decoded.get(`${px},${pz}`);
    const before = this.edges(px, pz);
    for (const [index, water, part = partWater(water)] of waters) {
      const [tx, tz] = [px * PLATE_TILES + (index % PLATE_TILES), pz * PLATE_TILES + Math.floor(index / PLATE_TILES)];
      this.waters.set(`${tx},${tz}`, water);
      const tile = plate?.tiles.get(index);
      if (tile) tile.water = water;
      const rendition = this.tile(tx, tz);
      if (rendition) rendition.water = part;
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
    return known ? seaEdges(this.waterOf(px, pz)) : (this.fileEdges.get(key) ?? null);
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
    this.worker ??= this.plateWorker();
  }

  startSaver() {
    this.saver ??= this.plateWorker();
  }

  plateWorker() {
    const worker = new Worker(new URL("./plateWorker.js", import.meta.url), { type: "module" });
    worker.postMessage({ biomes: this.biomeAreas });
    worker.postMessage({ water: this.waterFile });
    worker.onmessage = ({ data }) => {
      if (data.id === undefined) return this.done(data);
      this.writes.get(data.id)(data);
      this.writes.delete(data.id);
    };
    // A reader that stops is started again, with the plates it was reading.
    worker.onerror = (event) => {
      if (worker !== this.worker) return;
      console.error(`the plate reader stopped: ${event.message ?? "no reason given"}`);
      this.restartReader();
    };
    return worker;
  }

  restartReader() {
    this.worker?.terminate();
    this.worker = null;
    const again = [...this.onWorker];
    this.onWorker.clear();
    for (const key of again) {
      this.reading.delete(key);
      this.read(key);
    }
  }

  tellWorkers(message) {
    this.worker?.postMessage(message);
    this.saver?.postMessage(message);
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

  addPlatter(bytes) {
    const platter = decodePlatter(bytes);
    this.platters.set(platter.coords.join(","), platter);
  }

  // Keeps platter [px, pz]'s file to read when it's first wanted, or by readHeld(). Reading takes a
  // while on a phone, so play reads the platters near you first and holds the rest.
  holdPlatter(coords, bytes) {
    this.held.set(coords.join(","), bytes);
  }

  // Reads one held platter, giving whether there was one to read.
  readHeld(key = this.held.keys().next().value) {
    const bytes = this.held.get(key);
    if (!bytes) return false;
    this.held.delete(key);
    this.addPlatter(bytes);
    return true;
  }

  platterAt(key) {
    if (this.held.has(key)) this.readHeld(key);
    return this.platters.get(key);
  }

  addPlate(coords, bytes) {
    this.fileEdges.delete(coords.join(","));
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
    if (performance.now() - (this.unfetched.get(key) ?? -Infinity) < FETCH_AGAIN_MS) return;
    if (!this.plateFiles.has(key)) {
      // Made by hand: nothing to read.
      if (this.made.has(key)) this.done({ key, plate: { coords: key.split(",").map(Number), palette: [], tiles: new Map() } });
      // Or fetched first, where they're fetched as they're wanted (fetchPlate).
      else if (this.fetchPlate && this.plate(...key.split(",").map(Number))) this.fetch(key);
      return;
    }
    this.reading.add(key);
    if (typeof Worker === "undefined") return this.done({ key, plate: decodePlate(this.plateFiles.get(key)) });
    this.startWorker();
    this.onWorker.add(key);
    this.worker.postMessage({ key, bytes: this.plateFiles.get(key) });
  }

  // Fetches plate file `key` with fetchPlate(coords), which gives its bytes, then reads it.
  fetch(key) {
    this.reading.add(key);
    this.fetchPlate(key.split(",").map(Number)).then(
      (bytes) => {
        this.reading.delete(key);
        if (!bytes) return this.unreadable.add(key);
        this.plateFiles.set(key, bytes);
        this.read(key);
      },
      (error) => {
        // The network may be back by the next time it's wanted, unlike a file that can't be read.
        this.reading.delete(key);
        this.unfetched.set(key, performance.now());
        console.warn(`plate ${key} couldn't be fetched, and will be tried again: ${error.message ?? error}`);
      },
    );
  }

  done({ key, plate, error }) {
    this.reading.delete(key);
    this.onWorker.delete(key);
    this.unfetched.delete(key);
    if (error) {
      this.unreadable.add(key);
      console.error(`plate ${key} can't be read: ${error}`);
      return;
    }
    applyEdits(key, plate, this.editsFor(key));
    this.keep(key, plate);
    this.checkShores(key);
    this.onRead(key);
  }

  // Keeps a read plate file, the latest used last, dropping the least lately used past KEEP_PLATES.
  keep(key, plate) {
    this.decoded.delete(key);
    this.decoded.set(key, plate);
    if (this.decoded.size > KEEP_PLATES) this.decoded.delete(this.decoded.keys().next().value);
  }

  tile(tx, tz) {
    return this.platterAt(platterOf(tx, tz).join(","))?.tiles.get(indexIn(tx, tz)) ?? null;
  }

  plate(px, pz) {
    return this.platterAt(platterOfPlate(px, pz).join(","))?.plates.get(plateIndexIn(px, pz)) ?? null;
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

  // The look.js pattern of the ground at continent feet (x, z), or null where it's not been read.
  patternAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const kinds = this.cells(tx, tz)?.kinds;
    if (!kinds) return null;
    const i = Math.min(TILE_CELLS - 1, Math.floor((x - tx * TILE_FT) / CELL_FT));
    const j = Math.min(TILE_CELLS - 1, Math.floor((z - tz * TILE_FT) / CELL_FT));
    return PATTERNS[kinds[j * TILE_CELLS + i]] ?? null;
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

  // The ground's height at continent feet (x, z) between cell corners, its plate read now where
  // it's not been, or heightAt's where its plate has to be fetched first.
  cellHeightAt(x, z) {
    const key = `${Math.floor(x / PLATE_FT)},${Math.floor(z / PLATE_FT)}`;
    if (!this.decoded.has(key) && (this.plateFiles.has(key) || this.made.has(key))) {
      const plate = this.readNow(key);
      if (plate) {
        this.keep(key, plate);
        this.onRead(key);
      }
    }
    return this.heightAt(x, z);
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

// A height straight between a grid's corners (`side` a row), at (u, v) in grid squares.
function between(heights, side, u, v) {
  const [i, j] = [Math.min(side - 2, Math.floor(u)), Math.min(side - 2, Math.floor(v))];
  const [fu, fv] = [u - i, v - j];
  const h = (a, b) => heights[(j + b) * side + i + a];
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * fu;
  const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * fu;
  return top + (bottom - top) * fv;
}

