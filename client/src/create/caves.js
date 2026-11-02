import * as THREE from "three";
import { CAVES_PATH, TILE_CELLS, allStone, carve, cavesPath, growCave, smoothCave, decodeCaves, emptyColumns, encodeCaves, tileIndex } from "../v2/caves.js";
import { CELL_FT, CHUNK_FT, PLATE_TILES, TILE_FT } from "../v2/sizes.js";
import { caveMaterial, setBrush } from "./caveMaterial.js";
import { caveMesh, cutMesh, opensAt, zipped } from "./caveMesh.js";
import { ringed } from "./entranceJoin.js";
import { EMPTY_FT, FULL_TILES } from "./ground.js";

export { CAVES_PATH };

// The caves dug by hand (v2/caves.js) and what they do: their rock drawn round the builder,
// within MESH_TILES tiles, made again a few at a time as they change; the ground at their mouths
// left out of the ground drawn in full (Ground's holes); what the builder stands on and is kept
// out of; and the camera kept inside them. Each dig or fill can be undone, up to UNDOS of them.
//
// Two overlays show how the rock comes from the spans, each shown or hidden as a whole: the grid,
// a point of light at each column's middle for each span's floor and ceiling, joined to the
// neighbouring columns' by lines (floors gold, ceilings silver), seen through the rock; and lines,
// every edge of the rock's faces drawn glowing over them.

const MESH_TILES = FULL_TILES;
const BUILD_MS = 8; // how long making meshes may take a frame
const UNDOS = 50;
const CAMERA_FT = 1; // how far the camera's kept from rock
const PICK_FT = 1200;
const FLOOR_RGB = [1, 0.78, 0.2]; // the grid: floors gold, ceilings silver
const CEILING_RGB = [0.8, 0.84, 0.9];
const POINT_PX = 4;
const LINE_RGB = 0x5ad8ff;
const EARTH_LINE_RGB = 0x8a8a8a;

export class Caves {
  constructor(scene, renditions) {
    this.renditions = renditions;
    this.tiles = new Map(); // "tx,tz" -> columns, TILE_CELLS² spans each, or null for rock
    this.changed = new Set(); // "px,pz" of plates changed since they were saved
    this.undos = [];
    this.version = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = new Map(); // "tx,tz" -> its mesh, or null where there's no rock to draw
    this.stale = new Set(); // "tx,tz" of tiles whose meshes want making again
    // The rock's faces sit a little back, so lines drawn over their edges show.
    this.material = Object.assign(caveMaterial(), { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // The grid's drawn on its own, after the rest, hidden only by the builder (drawOver); the lines
    // with the rest.
    this.overlays = { grid: new THREE.Group(), lines: new THREE.Group() };
    for (const group of Object.values(this.overlays)) group.visible = false;
    scene.add(this.overlays.lines);
    this.pointMaterial = new THREE.PointsMaterial({ size: POINT_PX, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true });
    this.gridMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthWrite: false, transparent: true, opacity: 0.6 });
    this.lineMaterial = new THREE.LineBasicMaterial({ color: LINE_RGB, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.onMouths = null; // (plate keys) => void, when the ground at mouths changes
    // Entrances where they meet the ground (entranceJoin.js), by id, each with `plate`, the "px,pz"
    // of the file that keeps it; and from them, the ground cells left out. groundMesh(tx, tz): a
    // tile's ground mesh drawn in full, or null, whose material the joins take.
    this.entrances = new Map();
    this.entranceCells = new Set(); // "ci,cj"
    this.sealed = new Set(); // "ci,cj" of those and the cells round them, where the rock's closed over the ground
    this.held = new Set(); // "cx,cz" of the ground's chunks round entrances, kept from moving
    this.groundMesh = null;
    // Each entrance's ground joined to its rock, colored and drawn as the ground is; and for now,
    // the ground's edge in teal and the rock's in pink.
    this.joins = new THREE.Group();
    scene.add(this.joins);
    this.edges = [0x1ad1c4, 0xff2bd6].map((color) => {
      const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      lines.renderOrder = 14;
      lines.frustumCulled = false;
      scene.add(lines);
      return lines;
    });
    this.joinsMade = null; // what the joins were drawn from
    this.world = {
      spans: (ci, cj) => this.spans(ci, cj),
      ground: (ci, cj) => this.groundCell(ci, cj),
      corner: (ci, cj) => this.renditions.heightAt(ci * CELL_FT, cj * CELL_FT) ?? EMPTY_FT,
      mouth: (ci, cj) => this.opens(ci, cj),
      sealed: (ci, cj) => this.sealed.has(`${ci},${cj}`),
      caved: (tx, tz) => this.tiles.has(`${tx},${tz}`),
    };
  }

  // Takes plate (px, pz)'s caves file's bytes.
  load(bytes) {
    const { coords, tiles, entrances } = decodeCaves(bytes);
    for (const [index, columns] of tiles) this.tiles.set(`${coords[0] * PLATE_TILES + (index % PLATE_TILES)},${coords[1] * PLATE_TILES + Math.floor(index / PLATE_TILES)}`, columns);
    for (const { id, ...join } of entrances) this.setEntrance(id, join, coords.join(","), true);
    this.version++;
  }

  columnsOf(tx, tz, make = false) {
    const key = `${tx},${tz}`;
    if (!this.tiles.has(key) && make) this.tiles.set(key, emptyColumns());
    return this.tiles.get(key) ?? null;
  }

  // Continent cell (ci, cj)'s spans, lowest first.
  spans(ci, cj) {
    const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
    const columns = this.tiles.get(`${tx},${tz}`);
    return columns?.[(cj - tz * TILE_CELLS) * TILE_CELLS + ci - tx * TILE_CELLS] ?? EMPTY;
  }

  // The ground's height at cell (ci, cj)'s middle, -Infinity where it's not known.
  groundCell(ci, cj) {
    return this.renditions.heightAt((ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT) ?? -Infinity;
  }

  // Whether the ground at cell (ci, cj) opens into a cave, so isn't drawn.
  opens(ci, cj) {
    return this.spans(ci, cj).length > 0 && opensAt(this.world, ci, cj);
  }

  // Whether the ground at cell (ci, cj) opens into a cave, or is beside where it does.
  mouth(ci, cj) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.opens(ci + di, cj + dj)) return true;
    return false;
  }

  // Sets how entrance `id` meets the ground (entranceJoin.js), or with null, that it doesn't; kept
  // in plate `plate`'s file ("px,pz"). The ground's redrawn where its cells left out change, and
  // the rock's made again round them, cut back. With `saved`, its file isn't marked to save.
  setEntrance(id, join, plate = null, saved = false) {
    const before = this.entrances.get(id);
    if (join) this.entrances.set(id, { ...join, plate });
    else this.entrances.delete(id);
    for (const owner of [before?.plate, join && plate]) if (owner && !saved) this.changed.add(owner);
    const next = new Set([...this.entrances.values()].flatMap((e) => e.cells.map(([ci, cj]) => `${ci},${cj}`)));
    const plates = new Set();
    for (const [ci, cj] of [...(before?.cells ?? []), ...(join?.cells ?? [])]) {
      const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.stale.add(`${tx + dx},${tz + dz}`);
      plates.add(`${Math.floor(tx / PLATE_TILES)},${Math.floor(tz / PLATE_TILES)}`);
    }
    this.entranceCells = next;
    this.sealed = ringed(next);
    this.held = new Set([...this.entrances.values()].flatMap((e) => (e.chunks ?? []).map(([cx, cz]) => `${cx},${cz}`)));
    this.joinsMade = null;
    this.version++;
    if (plates.size) this.onMouths?.(plates);
  }

  // Whether the ground within `pad` ft of (x, z) is in a chunk kept from moving round an entrance,
  // edges and all.
  holds(x, z, pad = 0) {
    if (!this.held.size) return false;
    for (let cz = Math.floor((z - pad) / CHUNK_FT); cz <= Math.floor((z + pad) / CHUNK_FT); cz++) {
      for (let cx = Math.floor((x - pad) / CHUNK_FT); cx <= Math.floor((x + pad) / CHUNK_FT); cx++) if (this.held.has(`${cx},${cz}`)) return true;
    }
    return false;
  }

  // Whether the ground's been read in full within `reach` ft of the line from continent feet `from`
  // to `to`, asking for what hasn't.
  groundRead(from, to, reach) {
    let read = true;
    for (let tz = Math.floor((Math.min(from[2], to[2]) - reach) / TILE_FT); tz <= Math.floor((Math.max(from[2], to[2]) + reach) / TILE_FT); tz++) {
      for (let tx = Math.floor((Math.min(from[0], to[0]) - reach) / TILE_FT); tx <= Math.floor((Math.max(from[0], to[0]) + reach) / TILE_FT); tx++) {
        if (this.renditions.tile(tx, tz) && !this.renditions.cells(tx, tz)) read = false;
      }
    }
    return read;
  }

  // Tile (tx, tz)'s cells whose ground isn't drawn, where caves open through it or entrances reach
  // into it, as a Set of indices, or null for none.
  holes(tx, tz) {
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1 && !near; dx++) near = this.tiles.has(`${tx + dx},${tz + dz}`);
    if (!near) return null;
    const out = new Set();
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const [ci, cj] = [tx * TILE_CELLS + i, tz * TILE_CELLS + j];
        if (this.opens(ci, cj) || this.entranceCells.has(`${ci},${cj}`)) out.add(j * TILE_CELLS + i);
      }
    }
    return out.size ? out : null;
  }

  // Opens air in `shape` (v2/caves.js's carve), or fills it with rock with `fill`. Gives whether
  // anything changed.
  dig(shape, { fill = false, theme = 0, hewn = false, join = false } = {}) {
    const groundAt = (ci, cj) => (Number.isFinite(this.groundCell(ci, cj)) ? this.groundCell(ci, cj) : null);
    return this.change((columnsOf) => carve(shape, columnsOf, groundAt, { fill, stone: allStone(theme, hewn) }), join);
  }

  // Carves a cave layout's plan (caveLayout.js's carvePlan): its fills, then its opens, each
  // opening its own rock. Undoes as one, calling `undone` when it's undone. Gives the undo's entry,
  // or null where nothing changed.
  carvePlan({ fills, opens }, undone) {
    const groundAt = (ci, cj) => (Number.isFinite(this.groundCell(ci, cj)) ? this.groundCell(ci, cj) : null);
    const work = (columnsOf) => {
      const changed = new Set();
      for (const shape of fills) for (const key of carve(shape, columnsOf, groundAt, { fill: true })) changed.add(key);
      for (const { shape, stone, mouth } of opens) for (const key of carve(shape, columnsOf, groundAt, { stone, own: true, mouth })) changed.add(key);
      return changed;
    };
    if (!this.change(work, false, false)) return null;
    const entry = this.undos.at(-1);
    entry.undone = undone;
    return entry;
  }

  // Adds rock round continent feet `at` (on the rock), facing `normal`, out to `radius`, up to
  // `amountFt` (v2/caves.js's growCave). Gives whether anything changed.
  grow(at, normal, radius, { amountFt, join = false }) {
    const groundAt = (ci, cj) => (Number.isFinite(this.groundCell(ci, cj)) ? this.groundCell(ci, cj) : null);
    return this.change((columnsOf) => growCave({ at, normal, radius, amountFt }, columnsOf, groundAt), join);
  }

  // Smooths the rock round continent feet `at` (on the rock), facing `normal`, out to `radius`
  // (v2/caves.js's smoothCave). Gives whether anything changed.
  smooth(at, normal, radius, { strength = 0.5, join = false } = {}) {
    const groundAt = (ci, cj) => (Number.isFinite(this.groundCell(ci, cj)) ? this.groundCell(ci, cj) : null);
    return this.change((columnsOf) => smoothCave({ at, normal, radius, strength }, columnsOf, groundAt), join);
  }

  // The way the rock at continent feet `at` faces, out of it into the air, as a unit [x, y, z]:
  // from which points round it, `aroundFt` off, are air, so bumps smaller than that don't sway
  // it. Null where all round's rock or air.
  normalAt([x, y, z], aroundFt) {
    let [nx, ny, nz] = [0, 0, 0];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!(dx || dy || dz)) continue;
          const length = Math.hypot(dx, dy, dz);
          const sign = this.solid(x + (dx / length) * aroundFt, y + (dy / length) * aroundFt, z + (dz / length) * aroundFt) ? -1 : 1;
          [nx, ny, nz] = [nx + (sign * dx) / length, ny + (sign * dy) / length, nz + (sign * dz) / length];
        }
      }
    }
    const length = Math.hypot(nx, ny, nz);
    return length > 1e-6 ? [nx / length, ny / length, nz / length] : null;
  }

  // Makes a change, work(columnsOf), which gives the "tx,tz" of the tiles it changed, so it can
  // be undone: with what came before it (`join`), and with what comes after it till letGo
  // (`joinable`). Gives whether anything changed.
  change(work, join, joinable = true) {
    const before = new Map();
    const changed = work((tx, tz, make) => {
      const key = `${tx},${tz}`;
      if (!before.has(key)) before.set(key, this.tiles.has(key) ? structuredClone(this.tiles.get(key)) : null);
      return this.columnsOf(tx, tz, make);
    });
    for (const [key, columns] of before) if (!changed.has(key) && columns === null) this.tiles.delete(key);
    if (!changed.size) return false;
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

  // Ends a drag, so the next dig undoes on its own.
  letGo() {
    const last = this.undos.at(-1);
    if (last) last.join = false;
  }

  undo() {
    const entry = this.undos.pop();
    if (!entry) return false;
    for (const [key, columns] of entry.tiles) {
      if (columns) this.tiles.set(key, columns);
      else this.tiles.delete(key);
    }
    this.touched(new Set(entry.tiles.keys()));
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
    }
    const todo = [...wanted].filter((key) => near(key) && (!this.meshes.has(key) || this.stale.has(key)));
    if (!todo.length) return this.drawJoins();
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

  // Draws each entrance's ground joined to its rock (caveMesh.js's zipped), in the ground's
  // colors and its tile's material, once the ground's drawn there; and the edges.
  drawJoins() {
    const tileOf = (e) => [Math.floor(e.plane.center[0] / TILE_FT), Math.floor(e.plane.center[2] / TILE_FT)];
    const grounds = [...this.entrances.values()].map((e) => this.groundMesh?.(...tileOf(e)) ?? null);
    const made = `${this.version} ${grounds.map((g) => g?.geometry.uuid)}`;
    if (made === this.joinsMade) return;
    this.joinsMade = made;
    for (const child of [...this.joins.children]) {
      this.joins.remove(child);
      child.geometry.dispose();
    }
    const edges = [[], []];
    [...this.entrances.values()].forEach((entrance, n) => {
      [entrance.ground, entrance.rock].forEach((line, k) => line.forEach((p, i) => edges[k].push(...p, ...line[(i + 1) % line.length])));
      const ground = grounds[n];
      if (!ground) return;
      const { positions, indices } = zipped(entrance.ground, entrance.rock, entrance.steps, entrance.plane.normal);
      const colors = [];
      for (let i = 0; i < positions.length; i += 3) colors.push(...this.groundColor(positions[i], positions[i + 2]));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      // In the ground tile's own frame, which its material's patterns are laid out in.
      ground.updateWorldMatrix(true, false);
      geometry.applyMatrix4(ground.matrixWorld.clone().invert());
      const mesh = new THREE.Mesh(geometry, ground.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(ground.matrixWorld);
      this.joins.add(mesh);
    });
    edges.forEach((points, k) => {
      this.edges[k].geometry.dispose();
      this.edges[k].geometry = new THREE.BufferGeometry();
      this.edges[k].geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    });
  }

  // The ground's color at (x, z), linear, as the ground's drawn: its cell's.
  groundColor(x, z) {
    const [ci, cj] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
    const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
    const cells = this.renditions.cells(tx, tz);
    if (!cells?.colors) return [0.2, 0.2, 0.2];
    const k = ((cj - tz * TILE_CELLS) * TILE_CELLS + ci - tx * TILE_CELLS) * 3;
    return [0, 1, 2].map((m) => {
      const v = cells.colors[k + m] / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  }

  // Draws the grid, if it's shown, over what `renderer` drew last, hidden only by `over` (an
  // object in the scene, the builder), seen by `camera`.
  drawOver(renderer, camera, over) {
    if (!this.overlays.grid.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    const color = renderer.state.buffers.color;
    color.setMask(false);
    color.setLocked(true);
    renderer.render(over, camera);
    color.setLocked(false);
    color.setMask(true);
    renderer.render(this.overlays.grid, camera);
    renderer.autoClear = true;
  }

  // Shows a brush's patch on the rock (caveMaterial.js's setBrush), or none, with at null.
  brush(at, normal, radius) {
    setBrush(this.material, at, normal, radius);
  }

  // Shows or hides an overlay: "grid" or "lines".
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
    let data = caveMesh(tx, tz, this.world);
    if (!data) return this.meshes.set(key, null);
    // Cut back at the entrances whose ground's left out in or beside it.
    for (const entrance of this.entrances.values()) {
      const near = entrance.cells.some(([ci, cj]) => Math.abs(Math.floor(ci / TILE_CELLS) - tx) <= 1 && Math.abs(Math.floor(cj / TILE_CELLS) - tz) <= 1);
      if (near) data = cutMesh(data, entrance.plane, [tx * TILE_FT, 0, tz * TILE_FT]).mesh;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute("caveTheme", new THREE.BufferAttribute(data.themes, 1));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(tx * TILE_FT, 0, tz * TILE_FT);
    mesh.userData.tile = key;
    this.group.add(mesh);
    this.meshes.set(key, mesh);
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), this.lineMaterial);
    lines.position.copy(mesh.position);
    this.overlays.lines.add(lines);
    mesh.userData.overlays = [lines];
    for (const overlay of this.grid(tx, tz)) {
      this.overlays.grid.add(overlay);
      mesh.userData.overlays.push(overlay);
    }
  }

  // Tile (tx, tz)'s grid, as overlays: a point at each column's middle for each span's floor and
  // ceiling, and a line from each to the same in the columns beside it (+x and +z) whose spans
  // overlap it. None where it has no caves.
  grid(tx, tz) {
    const columns = this.tiles.get(`${tx},${tz}`);
    if (!columns) return [];
    const [points, pointColors, lines, lineColors] = [[], [], [], []];
    const middle = (ci, cj) => [(ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT];
    columns.forEach((spans, n) => {
      const [ci, cj] = [tx * TILE_CELLS + (n % TILE_CELLS), tz * TILE_CELLS + Math.floor(n / TILE_CELLS)];
      const [x, z] = middle(ci, cj);
      for (const span of spans ?? []) {
        points.push(x, span.floor, z, x, span.ceiling, z);
        pointColors.push(...FLOOR_RGB, ...CEILING_RGB);
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const [x2, z2] = middle(ci + di, cj + dj);
          for (const other of this.spans(ci + di, cj + dj)) {
            if (other.floor > span.ceiling || other.ceiling < span.floor) continue;
            lines.push(x, span.floor, z, x2, other.floor, z2, x, span.ceiling, z, x2, other.ceiling, z2);
            lineColors.push(...FLOOR_RGB, ...FLOOR_RGB, ...CEILING_RGB, ...CEILING_RGB);
          }
        }
      }
    });
    if (!points.length) return [];
    const geometry = (positions, colors) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      return g;
    };
    const out = [new THREE.Points(geometry(points, pointColors), this.pointMaterial)];
    if (lines.length) out.push(new THREE.LineSegments(geometry(lines, lineColors), this.gridMaterial));
    for (const overlay of out) overlay.renderOrder = 10;
    return out;
  }

  drop(mesh) {
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    for (const overlay of mesh.userData.overlays ?? []) {
      overlay.parent?.remove(overlay);
      overlay.geometry.dispose();
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
    for (const s of this.spans(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT))) out.push([s.floor, s.ceiling]);
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
    const g = this.renditions.heightAt(x, z) ?? EMPTY_FT;
    const spans = this.spans(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));
    if (!spans.length) return g;
    const floors = spans.filter((s) => s.floor <= g).map((s) => s.floor);
    if (!spans.some((s) => s.floor < g && g < s.ceiling)) floors.push(g);
    const below = floors.filter((y) => y <= under);
    return below.length ? Math.max(...below) : Math.min(...floors);
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

  // Where the camera can be, looking from `head` to `at` (Vector3s): `at`, or short of the first
  // rock between, near caves.
  clear(head, at) {
    if (!this.near(head.x, head.z) || this.solid(head.x, head.y, head.z)) return at;
    const way = at.clone().sub(head);
    const length = way.length();
    way.normalize();
    for (let t = 0.5; t < length + CAMERA_FT; t += 0.5) {
      const p = head.clone().addScaledVector(way, t);
      if (this.solid(p.x, p.y, p.z)) return head.clone().addScaledVector(way, Math.max(0, t - CAMERA_FT));
    }
    return at;
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
      const entrances = [...this.entrances].filter(([, e]) => e.plate === key).map(([id, { plate, ...join }]) => ({ id, ...join }));
      files.set(cavesPath(continent, [px, pz]), tiles.size || entrances.length ? encodeCaves([px, pz], tiles, entrances) : null);
    }
    this.changed.clear();
    return files;
  }
}

const EMPTY = Object.freeze([]);
