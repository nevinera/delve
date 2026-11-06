import * as THREE from "three";
import { CAVES_PATH, TILE_COLUMNS, VOXEL_FT, allStone, carve, cavesPath, decodeCaves, emptyColumns, encodeCaves, floorAt, floorSlopeAt, sharedChunks, tileIndex } from "../v2/caves.js";
import { CELL_FT, CHUNK_FT, PLATE_TILES, TILE_CHUNKS, TILE_FT } from "../v2/sizes.js";
import { caveMaterial } from "./caveMaterial.js";
import { PATTERNS } from "../v2/look.js";
import { mouthClutter } from "./mouthClutter.js";
import { caveBlocks, caveMesh, opensAt } from "./caveMesh.js";
import { EMPTY_FT, FULL_TILES } from "./ground.js";

export { CAVES_PATH };

// The caves dug by hand (v2/caves.js) and what they do: their rock drawn round the builder,
// within MESH_TILES tiles, made again a few at a time as they change; the ground at their mouths
// left out of the ground drawn in full (Ground's holes); what the builder stands on and is kept
// out of; and the camera kept inside them. Each dig or fill can be undone, up to UNDOS of them.
//
// The rock's drawn as one of VIEWS: finished, smoothed as players see it (caveMesh), or blocks,
// its voxels as cubes (caveBlocks). Its lines, every edge of the rock's faces drawn glowing, show
// from in the rock.

export const VIEWS = ["finished", "blocks"];
const MESH_TILES = FULL_TILES;
const BUILD_MS = 8; // how long making meshes may take a frame
const UNDOS = 50;
// How far the camera's kept from rock, all round: the rock's drawn smoothed and bumped up to
// about this far into its voxels' air.
const CAMERA_FT = 2.5;
const EDGE_OPACITY = 0.85; // how dark the blocks' edges are
const DRAWN_FT = 1; // how far the camera's kept short of drawn rock it'd look through
const EITHER_SIDE = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); // for rays to meet rock from behind
// Which ways round the camera rock's looked for: along the axes and the cube's corners.
const ROUND = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c].map((v) => v / Math.sqrt(3)))))];
const PICK_FT = 1200;
const LINE_RGB = 0x5ad8ff;
const EARTH_LINE_RGB = 0x8a8a8a;

export class Caves {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.tiles = new Map(); // "tx,tz" -> columns, TILE_COLUMNS² spans each, or null for rock
    this.changed = new Set(); // "px,pz" of plates changed since they were saved
    this.undos = [];
    this.refused = null; // why the last change was put back
    this.version = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = new Map(); // "tx,tz" -> its mesh, or null where there's no rock to draw
    this.stale = new Set(); // "tx,tz" of tiles whose meshes want making again
    this.view = VIEWS[0];
    // The rock's faces sit a little back, so lines drawn over their edges show.
    this.material = Object.assign(caveMaterial(), { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.overlays = { lines: new THREE.Group() };
    this.overlays.lines.visible = false;
    scene.add(this.overlays.lines);
    this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: EDGE_OPACITY }); // the blocks' edges
    this.lineMaterial = new THREE.LineBasicMaterial({ color: LINE_RGB, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.onMouths = null; // (plate keys) => void, when the ground at mouths changes
    // The ground the caves draw round mouths, in the ground's own material, groundMaterial(tx, tz),
    // or null till the ground's drawn there; shown whether the rock is or not.
    this.groundGroup = new THREE.Group();
    scene.add(this.groundGroup);
    this.groundMaterial = null;
    // What clutter round mouths needs (mouthClutter.js): the cave layout's entrances, the biome at
    // continent feet (x, z), and render/clutterMeshes.js's clutterMeshes to draw it, or null not to.
    this.entrances = () => [];
    this.biomeAt = () => "plains";
    this.clutterMeshes = null;
    this.clutterGroup = new THREE.Group();
    scene.add(this.clutterGroup);
    this.bands = new Map(); // "tx,tz" -> { version, cells }: band() as last worked out
    this.shownBands = new Map(); // "tx,tz" -> the band's cells the ground leaves out, as drawn
    this.world = {
      spans: (ci, cj) => this.spans(ci, cj),
      ground: (ci, cj) => this.groundCell(ci, cj),
      corner: (ci, cj) => this.renditions.heightAt(ci * VOXEL_FT, cj * VOXEL_FT) ?? EMPTY_FT,
      band: (ci, cj) => {
        const [i, j] = [Math.floor(ci / PER), Math.floor(cj / PER)];
        const [tx, tz] = [Math.floor(i / CELLS), Math.floor(j / CELLS)];
        return this.band(tx, tz)?.has((j - tz * CELLS) * CELLS + i - tx * CELLS) ?? false;
      },
      groundLook: (ci, cj) => this.groundLook(ci, cj),
      caved: (tx, tz) => this.tiles.has(`${tx},${tz}`),
    };
  }

  // Takes plate (px, pz)'s caves file's bytes. One from before cave networks has no caves, and its
  // plate's marked changed, so saving clears it.
  load(bytes, [px, pz]) {
    const { tiles, old } = decodeCaves(bytes);
    if (old) this.changed.add(`${px},${pz}`);
    for (const [index, columns] of tiles) this.tiles.set(`${px * PLATE_TILES + (index % PLATE_TILES)},${pz * PLATE_TILES + Math.floor(index / PLATE_TILES)}`, columns);
    this.version++;
  }

  columnsOf(tx, tz, make = false) {
    const key = `${tx},${tz}`;
    if (!this.tiles.has(key) && make) this.tiles.set(key, emptyColumns());
    return this.tiles.get(key) ?? null;
  }

  // Continent column (ci, cj)'s spans, lowest first.
  spans(ci, cj) {
    const [tx, tz] = [Math.floor(ci / TILE_COLUMNS), Math.floor(cj / TILE_COLUMNS)];
    const columns = this.tiles.get(`${tx},${tz}`);
    return columns?.[(cj - tz * TILE_COLUMNS) * TILE_COLUMNS + ci - tx * TILE_COLUMNS] ?? EMPTY;
  }

  // The ground's height at column (ci, cj)'s middle, -Infinity where it's not known.
  groundCell(ci, cj) {
    return this.renditions.heightAt((ci + 0.5) * VOXEL_FT, (cj + 0.5) * VOXEL_FT) ?? -Infinity;
  }

  // The ground's height at column (ci, cj)'s middle from its cells, reading them now where they've
  // not been read, or null where it's not known: what carving goes by.
  groundFine(ci, cj) {
    const height = this.renditions.cellHeightAt((ci + 0.5) * VOXEL_FT, (cj + 0.5) * VOXEL_FT);
    return Number.isFinite(height) ? height : null;
  }

  // Whether the ground at column (ci, cj) opens into a cave.
  opens(ci, cj) {
    return this.spans(ci, cj).length > 0 && opensAt(this.world, ci, cj);
  }

  // Whether the ground at column (ci, cj) opens into a cave, or is beside where it does.
  mouth(ci, cj) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.opens(ci + di, cj + dj)) return true;
    return false;
  }

  // Tile (tx, tz)'s ground cells the caves draw, in the band round mouths, as a Set of indices, or
  // null for none: those within BAND_CELLS of a cell where a cave opens through the ground.
  band(tx, tz) {
    const key = `${tx},${tz}`;
    const kept = this.bands.get(key);
    if (kept?.version === this.version) return kept.cells;
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1 && !near; dx++) near = this.tiles.has(`${tx + dx},${tz + dz}`);
    let cells = null;
    if (near) {
      const R = BAND_CELLS;
      const side = CELLS + 2 * R;
      // Which cells, the tile's and those round it, a cave opens through.
      const open = new Uint8Array(side * side);
      for (let j = -R; j < CELLS + R; j++) {
        for (let i = -R; i < CELLS + R; i++) {
          const [ci, cj] = [(tx * CELLS + i) * PER, (tz * CELLS + j) * PER];
          let opens = false;
          for (let b = 0; b < PER && !opens; b++) for (let a = 0; a < PER && !opens; a++) opens = this.opens(ci + a, cj + b);
          open[(j + R) * side + i + R] = opens ? 1 : 0;
        }
      }
      cells = new Set();
      for (let j = 0; j < CELLS; j++) {
        for (let i = 0; i < CELLS; i++) {
          let near = false;
          for (let b = -R; b <= R && !near; b++) for (let a = -R; a <= R && !near; a++) near = open[(j + R + b) * side + i + R + a] === 1;
          if (near) cells.add(j * CELLS + i);
        }
      }
      if (!cells.size) cells = null;
    }
    this.bands.set(key, { version: this.version, cells });
    return cells;
  }

  // After plate `key`'s ("px,pz") ground is read at cell scale: the bands and rock of the tiles in
  // it and beside it are worked out again, as where caves open through the ground, and how the
  // rock meets it there, depends on its height, which was coarser before.
  groundRead(key) {
    const [px, pz] = key.split(",").map(Number);
    const [x0, z0] = [px * PLATE_TILES - 1, pz * PLATE_TILES - 1];
    const [x1, z1] = [(px + 1) * PLATE_TILES, (pz + 1) * PLATE_TILES];
    for (const tile of this.meshes.keys()) {
      const [tx, tz] = tile.split(",").map(Number);
      if (tx < x0 || tx > x1 || tz < z0 || tz > z1) continue;
      this.bands.delete(tile);
      this.stale.add(tile);
    }
  }

  // Tile (tx, tz)'s ground cells that the ground leaves out, as a Set of indices, or null for none:
  // the band round mouths, once the caves have drawn the ground there.
  holes(tx, tz) {
    return this.shownBands.get(`${tx},${tz}`) ?? null;
  }

  // The ground's look at column corner (ci, cj), as the ground drawn in full has it at its cells'
  // corners, eased between them: { color, normal }, linear color.
  groundLook(ci, cj) {
    const [u, v] = [ci / PER, cj / PER];
    const [i, j] = [Math.floor(u), Math.floor(v)];
    const [fu, fv] = [u - i, v - j];
    const color = [0, 0, 0];
    const normal = [0, 0, 0];
    for (const [a, b, w] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
      if (!w) continue;
      const corner = this.groundCorner(i + a, j + b);
      for (let m = 0; m < 3; m++) [color[m], normal[m]] = [color[m] + corner.color[m] * w, normal[m] + corner.normal[m] * w];
    }
    const length = Math.hypot(...normal) || 1;
    return { color, normal: normal.map((n) => n / length) };
  }

  // The ground's look at cell corner (i, j), as the ground drawn in full has it: its color the
  // mean of the cells round it, and its normal from the heights a cell either way.
  groundCorner(i, j) {
    const color = [0, 0, 0];
    let count = 0;
    for (let b = j - 1; b <= j; b++) {
      for (let a = i - 1; a <= i; a++) {
        const [tx, tz] = [Math.floor(a / CELLS), Math.floor(b / CELLS)];
        const colors = this.renditions.cells?.(tx, tz)?.colors;
        if (!colors) continue;
        const k = ((b - tz * CELLS) * CELLS + a - tx * CELLS) * 3;
        for (let m = 0; m < 3; m++) color[m] += linear(colors[k + m]);
        count++;
      }
    }
    const h = (x, z) => this.renditions.heightAt(x, z) ?? EMPTY_FT;
    const [x, z] = [i * CELL_FT, j * CELL_FT];
    const [nx, nz] = [(h(x - CELL_FT, z) - h(x + CELL_FT, z)) / (2 * CELL_FT), (h(x, z - CELL_FT) - h(x, z + CELL_FT)) / (2 * CELL_FT)];
    const length = Math.hypot(nx, 1, nz);
    return { color: count ? color.map((c) => c / count) : [0.2, 0.2, 0.2], normal: [nx / length, 1 / length, nz / length] };
  }

  // The ground's pattern at continent feet (x, z), look.js's PATTERNS, or null where its cells
  // aren't read.
  patternAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const kinds = this.renditions.cells?.(tx, tz)?.kinds;
    if (!kinds) return null;
    return PATTERNS[kinds[Math.floor(z / CELL_FT - tz * CELLS) * CELLS + Math.floor(x / CELL_FT - tx * CELLS)]] ?? null;
  }

  // Opens air in `shape` (v2/caves.js's carve), or fills it with rock with `fill`. Gives whether
  // anything changed.
  dig(shape, { fill = false, theme = 0, join = false, net = undefined } = {}) {
    const groundAt = (ci, cj) => this.groundFine(ci, cj);
    return this.change((columnsOf) => carve(shape, columnsOf, groundAt, { fill, stone: allStone(theme), net }), join);
  }

  // Carves a cave layout's plan (caveLayout.js's carvePlan): its fills, then its opens, each
  // opening its own rock. Undoes as one, calling `undone` when it's undone. Gives the undo's entry,
  // or null where nothing changed.
  carvePlan(plan, undone) {
    if (!this.change(this.carving(plan), false, false)) return null;
    const entry = this.undos.at(-1);
    entry.undone = undone;
    return entry;
  }

  // What carves plan { fills, opens, clear } (caveLayout.js's carvePlan), given columnsOf(tx, tz,
  // make): the "tx,tz" of the tiles it changed. `clear`: a network all of whose air goes first.
  carving({ fills, opens, clear = null }) {
    const groundAt = (ci, cj) => this.groundFine(ci, cj);
    return (columnsOf) => {
      const changed = new Set();
      if (clear) {
        for (const key of [...this.tiles.keys()]) {
          const [tx, tz] = key.split(",").map(Number);
          const columns = columnsOf(tx, tz);
          if (!columns.some((spans) => spans?.some((s) => s.net === clear))) continue;
          for (let k = 0; k < columns.length; k++) {
            if (!columns[k]?.length) continue;
            const kept = columns[k].filter((s) => s.net !== clear);
            columns[k] = kept.length ? kept : null;
          }
          changed.add(key);
        }
      }
      for (const shape of fills) for (const key of carve(shape, columnsOf, groundAt, { fill: true })) changed.add(key);
      for (const { shape, stone, mouth, net } of opens) for (const key of carve(shape, columnsOf, groundAt, { stone, own: true, mouth, net })) changed.add(key);
      return changed;
    };
  }

  // Makes a change, work(columnsOf), which gives the "tx,tz" of the tiles it changed, so it can
  // be undone: with what came before it (`join`), and with what comes after it till letGo
  // (`joinable`). Gives whether anything changed. A change that would put a second network in a
  // 32 ft chunk is put back, with why in `refused`.
  change(work, join, joinable = true) {
    this.refused = null;
    const before = new Map();
    const changed = work((tx, tz, make) => {
      const key = `${tx},${tz}`;
      if (!before.has(key)) before.set(key, this.tiles.has(key) ? structuredClone(this.tiles.get(key)) : null);
      return this.columnsOf(tx, tz, make);
    });
    for (const [key, columns] of before) if (!changed.has(key) && columns === null) this.tiles.delete(key);
    if (!changed.size) return false;
    this.refused = this.shareProblem(changed, before);
    if (this.refused) {
      for (const [key, columns] of before) {
        if (columns) this.tiles.set(key, columns);
        else this.tiles.delete(key);
      }
      return false;
    }
    // A drag undoes as one: what was there when it began. Each dig can be joined by those after
    // it (`join`) till letGo.
    const last = this.undos.at(-1);
    if (join && last?.join) {
      for (const key of changed) if (!last.tiles.has(key)) last.tiles.set(key, before.get(key));
    } else {
      this.undos.push({ tiles: new Map([...changed].map((key) => [key, before.get(key)])), join: joinable });
      if (this.undos.length > UNDOS) this.undos.shift();
    }
    this.touched(changed);
    return true;
  }

  // The network whose 32 ft chunk (x, z) is in, or null where none has one.
  netAt(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const columns = this.tiles.get(`${tx},${tz}`);
    if (!columns) return null;
    const n = CHUNK_FT / VOXEL_FT;
    const [i0, j0] = [Math.floor((x - tx * TILE_FT) / CHUNK_FT) * n, Math.floor((z - tz * TILE_FT) / CHUNK_FT) * n];
    for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) if (columns[j * TILE_COLUMNS + i]?.length) return columns[j * TILE_COLUMNS + i][0].net;
    return null;
  }

  // Why tiles `changed` can't stay as they are, or null: a chunk shared by networks that wasn't
  // shared in `before`.
  shareProblem(changed, before) {
    for (const key of changed) {
      const was = before.get(key) ? sharedChunks(before.get(key)) : new Map();
      for (const [c, nets] of sharedChunks(this.tiles.get(key))) {
        if (was.get(c)?.length === nets.length) continue;
        const [tx, tz] = key.split(",").map(Number);
        const [x, z] = [tx * TILE_FT + (c % TILE_CHUNKS) * CHUNK_FT, tz * TILE_FT + Math.floor(c / TILE_CHUNKS) * CHUNK_FT];
        return `can't carve: ${nets.join(" and ")} would share the 32 ft chunk at ${x}, ${z}, and each chunk belongs to one network, even one above another`;
      }
    }
    return null;
  }

  // Makes a hand edit, work(columnsOf) as change takes it, undone not by undo but by restore:
  // gives the tiles it changed as they were before it, or null where nothing changed.
  edit(work) {
    if (!this.change(work, false, false)) return null;
    return this.undos.pop().tiles;
  }

  // Puts tiles back as they were, as edit gave them.
  restore(tiles) {
    for (const [key, columns] of tiles) {
      if (columns) this.tiles.set(key, columns);
      else this.tiles.delete(key);
    }
    this.touched(new Set(tiles.keys()));
  }

  // Ends a drag, so the next dig undoes on its own.
  letGo() {
    const last = this.undos.at(-1);
    if (last) last.join = false;
  }

  undo() {
    const entry = this.undos.pop();
    if (!entry) return false;
    this.restore(entry.tiles);
    entry.undone?.();
    return true;
  }

  // Marks tiles ("tx,tz") changed: their plates to save, their and their neighbours' meshes to
  // make again, and the ground round them.
  touched(keys) {
    const plates = new Set();
    for (const key of keys) {
      const [tx, tz] = key.split(",").map(Number);
      const columns = this.tiles.get(key);
      if (columns && !columns.some(Boolean)) this.tiles.delete(key);
      this.changed.add(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          this.stale.add(`${tx + dx},${tz + dz}`);
          plates.add(`${Math.floor((tx + dx) / PLATE_TILES)},${Math.floor((tz + dz) / PLATE_TILES)}`);
        }
      }
    }
    this.version++;
    this.onMouths?.(plates);
  }

  // Each frame, with the builder at (x, z): makes the meshes of tiles near caves within
  // MESH_TILES, nearest first, as long as BUILD_MS allows, and drops those further.
  tick(x, z) {
    const [bx, bz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    const near = (key) => {
      const [tx, tz] = key.split(",").map(Number);
      return Math.max(Math.abs(tx - bx), Math.abs(tz - bz)) <= MESH_TILES;
    };
    for (const [key, mesh] of this.meshes) {
      if (near(key)) continue;
      this.drop(mesh);
      this.meshes.delete(key);
      this.showBand(...key.split(",").map(Number), null);
    }
    const wanted = new Set();
    for (const key of this.tiles.keys()) {
      const [tx, tz] = key.split(",").map(Number);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) wanted.add(`${tx + dx},${tz + dz}`);
    }
    for (const [key, mesh] of this.meshes) {
      if (wanted.has(key)) continue;
      this.drop(mesh);
      this.meshes.delete(key);
      this.showBand(...key.split(",").map(Number), null);
    }
    const todo = [...wanted].filter((key) => near(key) && (!this.meshes.has(key) || this.stale.has(key)));
    if (!todo.length) return;
    const distance = (key) => {
      const [tx, tz] = key.split(",").map(Number);
      return Math.hypot(tx + 0.5 - x / TILE_FT, tz + 0.5 - z / TILE_FT);
    };
    todo.sort((a, b) => distance(a) - distance(b));
    const start = performance.now();
    for (const key of todo) {
      if (performance.now() - start > BUILD_MS) break;
      this.make(key);
    }
  }

  // Draws the rock as `view`, one of VIEWS.
  setView(view) {
    if (view === this.view || !VIEWS.includes(view)) return;
    this.view = view;
    // The blocks' faces sit a touch further back, so their edges show on them.
    const back = view === "blocks" ? 2 : 1;
    Object.assign(this.material, { polygonOffsetFactor: back, polygonOffsetUnits: back });
    for (const key of this.meshes.keys()) this.stale.add(key);
  }

  // Shows or hides an overlay: "lines".
  show(overlay, shown) {
    this.overlays[overlay].visible = shown;
  }

  // Draws the caves as they look from the earth, or as they look from in them or the open: from
  // the earth, the rock's faces' edges alone, in dull gray.
  fromEarth(on) {
    this.group.visible = !on;
    if (on) this.overlays.lines.visible = true;
    this.lineMaterial.color.set(on ? EARTH_LINE_RGB : LINE_RGB);
    this.lineMaterial.blending = on ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.lineMaterial.opacity = on ? 0.5 : 0.7;
  }

  make(key) {
    const [tx, tz] = key.split(",").map(Number);
    this.stale.delete(key);
    const old = this.meshes.get(key);
    if (old) this.drop(old);
    const data = (this.view === "blocks" ? caveBlocks : caveMesh)(tx, tz, this.world);
    // The ground left out where the caves draw it, once they do.
    const band = data?.ground ? this.band(tx, tz) : null;
    const material = band && this.groundMaterial?.(tx, tz);
    if (band && !material) {
      // Not till the ground's drawn there, to take its material.
      this.stale.add(key);
      return this.meshes.set(key, null);
    }
    this.showBand(tx, tz, band);
    if (!data) return this.meshes.set(key, null);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute("caveTheme", new THREE.BufferAttribute(data.themes, 1));
    geometry.setAttribute("caveDay", new THREE.BufferAttribute(data.days ?? new Float32Array(data.themes.length), 1));
    geometry.setAttribute("caveGround", new THREE.BufferAttribute(data.grounds ?? new Float32Array(data.themes.length * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    if (data.normals) geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    else geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(tx * TILE_FT, 0, tz * TILE_FT);
    mesh.userData.tile = key;
    this.group.add(mesh);
    this.meshes.set(key, mesh);
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), this.lineMaterial);
    lines.position.copy(mesh.position);
    this.overlays.lines.add(lines);
    mesh.userData.overlays = [lines];
    if (data.edges?.length) {
      const edges = new THREE.BufferGeometry();
      edges.setAttribute("position", new THREE.BufferAttribute(data.edges, 3));
      const outlines = new THREE.LineSegments(edges, this.edgeMaterial);
      outlines.position.copy(mesh.position);
      this.group.add(outlines);
      mesh.userData.overlays.push(outlines);
    }
    if (data.lips?.length && this.clutterMeshes) {
      const clutter = this.clutterMeshes(mouthClutter(tx, tz, data, { entrances: this.entrances(), biomeAt: this.biomeAt, patternAt: (x, z) => this.patternAt(x, z) }), [0, 0]);
      for (const piece of clutter) this.clutterGroup.add(piece);
      mesh.userData.clutter = clutter;
    }
    if (data.ground) {
      const earth = new THREE.BufferGeometry();
      earth.setAttribute("position", new THREE.BufferAttribute(data.ground.positions, 3));
      earth.setAttribute("color", new THREE.BufferAttribute(data.ground.colors, 3));
      earth.setAttribute("normal", new THREE.BufferAttribute(data.ground.normals, 3));
      if (data.ground.rocks) earth.setAttribute("groundRock", new THREE.BufferAttribute(data.ground.rocks, 1));
      if (data.ground.stones) earth.setAttribute("groundStone", new THREE.BufferAttribute(data.ground.stones, 3));
      earth.setIndex(new THREE.BufferAttribute(data.ground.indices, 1));
      const surface = new THREE.Mesh(earth, material);
      surface.position.copy(mesh.position);
      this.groundGroup.add(surface);
      mesh.userData.overlays.push(surface);
    }
  }

  // Has the ground leave out tile (tx, tz)'s `cells` (a Set of indices, or null), redrawing it
  // where they've changed.
  showBand(tx, tz, cells) {
    const key = `${tx},${tz}`;
    const before = this.shownBands.get(key) ?? null;
    if ([...(before ?? [])].join(",") === [...(cells ?? [])].join(",")) return;
    if (cells) this.shownBands.set(key, cells);
    else this.shownBands.delete(key);
    this.onMouths?.(new Set([`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`]));
  }

  drop(mesh) {
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    for (const overlay of mesh.userData.overlays ?? []) {
      overlay.parent?.remove(overlay);
      overlay.geometry.dispose();
    }
    // Each piece's geometry is its own, though the shapes in it are shared (clutterMeshes.js).
    for (const piece of mesh.userData.clutter ?? []) {
      piece.parent?.remove(piece);
      piece.dispose();
      piece.geometry.dispose();
    }
  }

  // Whether there are caves in tile (tx, tz) or beside it.
  near(x, z) {
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.tiles.has(`${tx + dx},${tz + dz}`)) return true;
    return false;
  }

  // The air over (x, z), as [low, high] heights, lowest first: the caves' spans, joined with the
  // sky over the ground where they open into it.
  air(x, z) {
    const g = this.renditions.heightAt(x, z) ?? EMPTY_FT;
    const out = [];
    for (const s of this.spans(Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT))) out.push([s.floor, s.ceiling]);
    out.push([g, Infinity]);
    out.sort((a, b) => a[0] - b[0]);
    const joined = [];
    for (const [low, high] of out) {
      const last = joined.at(-1);
      if (last && low <= last[1]) last[1] = Math.max(last[1], high);
      else joined.push([low, high]);
    }
    return joined;
  }

  // The height to stand at at (x, z) no higher than `under`: the highest floor there, a cave's or
  // the ground where no cave opens it, or the lowest where none is under it.
  groundAt(x, z, under = Infinity) {
    return this.standingOn(x, z, under).height;
  }

  // How steep the face groundAt stands on at (x, z) is, rise over run.
  slopeAt(x, z, under = Infinity) {
    return this.standingOn(x, z, under).slope();
  }

  // What groundAt stands on: { height, slope(), how steep its face is }.
  standingOn(x, z, under) {
    const g = this.renditions.heightAt(x, z) ?? EMPTY_FT;
    const ground = { height: g, slope: () => this.renditions.slopeAt(x, z) ?? 0 };
    const spans = this.spans(Math.floor(x / VOXEL_FT), Math.floor(z / VOXEL_FT));
    if (!spans.length) return ground;
    const spansAt = (ci, cj) => this.spans(ci, cj);
    const floors = spans.filter((s) => s.floor <= g).map((s) => ({ height: floorAt(spansAt, x, z, s), slope: () => floorSlopeAt(spansAt, x, z, s) }));
    if (!spans.some((s) => s.floor < g && g < s.ceiling)) floors.push(ground);
    const below = floors.filter((f) => f.height <= under);
    const pick = (list, better) => list.reduce((best, f) => (better(f.height, best.height) ? f : best));
    return below.length ? pick(below, (a, b) => a > b) : pick(floors, (a, b) => a < b);
  }

  // Whether rock at (x, z) is anywhere from `low` to `high`, near caves; away from them, never.
  inRock(x, z, low, high) {
    if (!this.near(x, z)) return false;
    return !this.air(x, z).some(([a, b]) => a <= low && high <= b);
  }

  // Whether continent feet (x, y, z) is in rock.
  solid(x, y, z) {
    return !this.air(x, z).some(([a, b]) => a <= y && y <= b);
  }

  // The cave air `ray` points at, as continent feet [x, y, z], or null: from in a cave, just
  // short of the rock it meets; from in rock or the open, the first cave air past rock (through).
  aimed(ray) {
    const { origin, direction } = ray;
    const inCave = !this.solid(origin.x, origin.y, origin.z) && origin.y < (this.renditions.heightAt(origin.x, origin.z) ?? EMPTY_FT);
    if (!inCave) return this.through(ray);
    const at = this.hit(ray);
    return at && at.map((v, k) => v - [direction.x, direction.y, direction.z][k]);
  }

  // The first cave air `ray` comes to past rock, as continent feet [x, y, z], or null: from in a
  // cave or the open, past the rock it next meets; from in rock, the first it comes to.
  through(ray) {
    const { origin, direction } = ray;
    const p = new THREE.Vector3();
    const point = (t) => p.copy(origin).addScaledVector(direction, t);
    const caveAir = (q) => !this.solid(q.x, q.y, q.z) && q.y < (this.renditions.heightAt(q.x, q.z) ?? EMPTY_FT);
    let rock = this.solid(origin.x, origin.y, origin.z);
    for (let t = 0; t < PICK_FT; t += Math.max(0.5, t * 0.01)) {
      const q = point(t);
      if (!rock) rock = this.solid(q.x, q.y, q.z);
      else if (caveAir(q)) return [q.x, q.y, q.z];
    }
    return null;
  }

  // Where the camera can be, looking from `head` to `at` (Vector3s): `at`, or short of where it'd
  // come near rock between, near caves. Close to the head the room it's kept grows from nothing,
  // so it isn't pulled into the builder under a low roof.
  clear(head, at) {
    if (!this.near(head.x, head.z) || this.solid(head.x, head.y, head.z)) return at;
    const way = at.clone().sub(head);
    const length = way.length();
    way.normalize();
    const p = new THREE.Vector3();
    const near = (t) => {
      p.copy(head).addScaledVector(way, t);
      const room = Math.min(CAMERA_FT, t);
      return this.solid(p.x, p.y, p.z) || ROUND.some(([dx, dy, dz]) => this.solid(p.x + dx * room, p.y + dy * room, p.z + dz * room));
    };
    let reach = length;
    for (let t = 0.5; t <= length; t += 0.5) {
      if (near(t)) {
        reach = t - 0.5;
        break;
      }
    }
    if (reach === length && near(length)) reach = Math.max(0, length - 0.5);
    // Round a mouth the voxels are open to the sky, but the rock's drawn closing over them.
    const drawn = this.drawnHit(head, way, reach + DRAWN_FT);
    if (drawn !== null) reach = Math.min(reach, Math.max(0, drawn - DRAWN_FT));
    return reach === length ? at : head.clone().addScaledVector(way, reach);
  }

  // How far along a ray from `head` the way `way` (a unit Vector3) the drawn rock or the ground
  // round a mouth is, either side of it, within `far`, or null.
  drawnHit(head, way, far) {
    const box = new THREE.Box3();
    const meshes = [];
    for (const mesh of this.meshes.values()) {
      if (!mesh) continue;
      for (const drawn of [mesh, ...(mesh.userData.overlays ?? [])]) {
        if (!drawn.isMesh) continue;
        if (!drawn.geometry.boundingBox) drawn.geometry.computeBoundingBox();
        box.copy(drawn.geometry.boundingBox).translate(drawn.position);
        if (box.distanceToPoint(head) <= far) meshes.push(drawn);
      }
    }
    if (!meshes.length) return null;
    const raycaster = new THREE.Raycaster(head, way, 0, far);
    let nearest = null;
    for (const drawn of meshes) {
      const material = drawn.material;
      drawn.material = EITHER_SIDE;
      const [hit] = raycaster.intersectObject(drawn, false);
      drawn.material = material;
      if (hit && (nearest === null || hit.distance < nearest)) nearest = hit.distance;
    }
    return nearest;
  }

  // Where a ray (THREE.Ray) first meets rock, the ground's or a cave's, [x, y, z], or null.
  hit(ray) {
    const { origin, direction } = ray;
    const solid = (t) => this.solid(origin.x + direction.x * t, origin.y + direction.y * t, origin.z + direction.z * t);
    let [t0, t] = [0, 0];
    while (t < PICK_FT) {
      t0 = t;
      t += Math.max(0.5, t * 0.01);
      if (solid(t)) break;
    }
    if (t >= PICK_FT) return null;
    for (let k = 0; k < 12; k++) {
      const mid = (t0 + t) / 2;
      if (solid(mid)) t = mid;
      else t0 = mid;
    }
    const p = origin.clone().addScaledVector(direction, t);
    return [p.x, p.y, p.z];
  }

  // The files of the plates changed since they were saved, path -> bytes, or null for those with
  // no caves left.
  unsavedFiles(continent) {
    const files = new Map();
    for (const key of this.changed) {
      const [px, pz] = key.split(",").map(Number);
      const tiles = new Map();
      for (let j = 0; j < PLATE_TILES; j++) {
        for (let i = 0; i < PLATE_TILES; i++) {
          const [tx, tz] = [px * PLATE_TILES + i, pz * PLATE_TILES + j];
          const columns = this.tiles.get(`${tx},${tz}`);
          if (columns) tiles.set(tileIndex(tx, tz), columns);
        }
      }
      files.set(cavesPath(continent, [px, pz]), tiles.size ? encodeCaves([px, pz], tiles) : null);
    }
    this.changed.clear();
    return files;
  }
}

const EMPTY = Object.freeze([]);
const CELLS = TILE_FT / CELL_FT; // the ground's cells a tile a side
const PER = CELL_FT / VOXEL_FT; // columns a ground cell a side
const BAND_CELLS = 2; // how many ground cells round where a cave opens the caves draw the ground in

// An sRGB byte's linear value.
const linear = (byte) => {
  const v = byte / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
