import * as THREE from "three";
import { CAVES_PATH, TILE_CELLS, carve, cavesPath, decodeCaves, emptyColumns, encodeCaves, tileIndex } from "../v2/caves.js";
import { CELL_FT, PLATE_TILES, TILE_FT } from "../v2/sizes.js";
import { caveMaterial } from "./caveMaterial.js";
import { caveMesh, opensAt } from "./caveMesh.js";
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
    this.materials = [caveMaterial(), new THREE.MeshLambertMaterial({ vertexColors: true })];
    // The rock's faces sit a little back, so lines drawn over their edges show.
    for (const material of this.materials) Object.assign(material, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.overlays = { grid: new THREE.Group(), lines: new THREE.Group() };
    for (const group of Object.values(this.overlays)) {
      group.visible = false;
      scene.add(group);
    }
    this.pointMaterial = new THREE.PointsMaterial({ size: POINT_PX, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true });
    this.gridMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 });
    this.lineMaterial = new THREE.LineBasicMaterial({ color: LINE_RGB, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.onMouths = null; // (plate keys) => void, when the ground at mouths changes
    this.world = {
      spans: (ci, cj) => this.spans(ci, cj),
      ground: (ci, cj) => this.groundCell(ci, cj),
      corner: (ci, cj) => this.renditions.heightAt(ci * CELL_FT, cj * CELL_FT) ?? EMPTY_FT,
      rgb: (ci, cj) => this.rgbCell(ci, cj),
      mouth: (ci, cj) => this.mouth(ci, cj),
      caved: (tx, tz) => this.tiles.has(`${tx},${tz}`),
    };
  }

  // Takes plate (px, pz)'s caves file's bytes.
  load(bytes) {
    const { coords, tiles } = decodeCaves(bytes);
    for (const [index, columns] of tiles) this.tiles.set(`${coords[0] * PLATE_TILES + (index % PLATE_TILES)},${coords[1] * PLATE_TILES + Math.floor(index / PLATE_TILES)}`, columns);
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

  rgbCell(ci, cj) {
    const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
    const cells = this.renditions.cells(tx, tz);
    if (!cells?.colors) return null;
    const k = ((cj - tz * TILE_CELLS) * TILE_CELLS + ci - tx * TILE_CELLS) * 3;
    return [cells.colors[k], cells.colors[k + 1], cells.colors[k + 2]];
  }

  // Whether the ground at cell (ci, cj) is drawn with the caves: where it opens into one, or is
  // beside where it does.
  mouth(ci, cj) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.spans(ci + di, cj + dj).length && opensAt(this.world, ci + di, cj + dj)) return true;
    return false;
  }

  // Tile (tx, tz)'s cells whose ground the caves draw, as a Set of indices, or null for none.
  holes(tx, tz) {
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1 && !near; dx++) near = this.tiles.has(`${tx + dx},${tz + dz}`);
    if (!near) return null;
    const out = new Set();
    for (let j = 0; j < TILE_CELLS; j++) for (let i = 0; i < TILE_CELLS; i++) if (this.mouth(tx * TILE_CELLS + i, tz * TILE_CELLS + j)) out.add(j * TILE_CELLS + i);
    return out.size ? out : null;
  }

  // Opens air in `shape` (v2/caves.js's carve), or fills it with rock with `fill`. Gives whether
  // anything changed.
  dig(shape, { fill = false, theme = 0, hewn = false, join = false } = {}) {
    const before = new Map();
    const keep = (tx, tz, make) => {
      const key = `${tx},${tz}`;
      if (!before.has(key)) before.set(key, this.tiles.has(key) ? structuredClone(this.tiles.get(key)) : null);
      return this.columnsOf(tx, tz, make);
    };
    const changed = carve(shape, keep, (ci, cj) => (Number.isFinite(this.groundCell(ci, cj)) ? this.groundCell(ci, cj) : null), { fill, theme, hewn });
    for (const [key, columns] of before) if (!changed.has(key) && columns === null) this.tiles.delete(key);
    if (!changed.size) return false;
    // A drag undoes as one: what was there when it began. Each dig can be joined by those after
    // it (`join`) till letGo.
    const last = this.undos.at(-1);
    if (join && last?.join) {
      for (const key of changed) if (!last.tiles.has(key)) last.tiles.set(key, before.get(key));
    } else {
      this.undos.push({ tiles: new Map([...changed].map((key) => [key, before.get(key)])), join: true });
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

  // Shows or hides an overlay: "grid" or "lines".
  show(overlay, shown) {
    this.overlays[overlay].visible = shown;
  }

  make(key) {
    const [tx, tz] = key.split(",").map(Number);
    this.stale.delete(key);
    const old = this.meshes.get(key);
    if (old) this.drop(old);
    const data = caveMesh(tx, tz, this.world);
    if (!data) return this.meshes.set(key, null);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute("caveTheme", new THREE.BufferAttribute(data.themes, 1));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.addGroup(0, data.inside, 0);
    geometry.addGroup(data.inside, data.indices.length - data.inside, 1);
    const mesh = new THREE.Mesh(geometry, this.materials);
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
      files.set(cavesPath(continent, [px, pz]), tiles.size ? encodeCaves([px, pz], tiles) : null);
    }
    this.changed.clear();
    return files;
  }
}

const EMPTY = Object.freeze([]);
