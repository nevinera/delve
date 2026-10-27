import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BLOCK, LAND_FT, SEA_FLOOR_FT, blockKey } from "../world/landGrid.js";
import { TILE_FT } from "../world/constants.js";
import { brush, ramp, stamp } from "./sculptTools.js";

// The heights step's view: the land grid (landGrid.js) in 3d, a vertex per point, to sculpt with
// the tools in sculptTools.js under the cursor. Left-drag works a brush, a click places a stamp,
// and two clicks lay a ramp; right-drag turns, middle-drag pans, the wheel zooms. Held down, shift
// smooths instead, and ctrl (or cmd) turns a tool around: raise lowers, noise and added stamps go
// the other way, and stamps raised to their shape cut down to it instead. Beyond the grid's blocks the sea floor's a flat sheet, and the sea's a
// clear sheet at 0 over everything. The ground can be coloured by height (the same heat map as the
// 2d heights map), and lined with contours and the 32ft grid. It draws only when something changes,
// or while a stroke goes on.
// Each stroke, stamp and ramp can be undone.
const FOV = 45;
const MIN_DISTANCE_FT = 150;
const MAX_DISTANCE_FT = 400000;
const SKY = 0xb8c8d8;
const ABOVE_GROUND_FT = 40; // the least the camera keeps above the ground under it
const KEY_PAN = 0.8; // of the camera's distance, per second
const KEY_ZOOM = 1.5;
const KEY_TURN = 1.5; // radians per second
const UNDO_STROKES = 40;
const SEA_SIZE_FT = 2e6;

export class SculptView {
  // onStroke() when a stroke ends, having changed the land; onPointer(point) with the ground under
  // the cursor, [x, h, z] in ft, or null.
  constructor(canvas, { onStroke, onPointer }) {
    this.canvas = canvas;
    this.onStroke = onStroke;
    this.onPointer = onPointer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 5, 4e6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.minDistance = MIN_DISTANCE_FT;
    this.controls.maxDistance = MAX_DISTANCE_FT;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.zoomSpeed = 1.5;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener("change", () => this.moved());

    this.uniforms = { uHeat: { value: 1 }, uContours: { value: 1 }, uGrid: { value: 0 } };
    this.material = groundMaterial(this.uniforms);
    this.blocks = new Map(); // blockKey -> mesh
    this.land = new THREE.Group();
    this.scene.add(this.land);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SIZE_FT, SEA_SIZE_FT).rotateX(-Math.PI / 2), this.material);
    floor.position.y = SEA_FLOOR_FT - 0.05;
    this.scene.add(floor);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA_SIZE_FT, SEA_SIZE_FT).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2a6fb0, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    sea.renderOrder = 1;
    this.scene.add(sea);
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.rampLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe080, depthTest: false, transparent: true }));
    this.rampLine.renderOrder = 2;
    this.rampLine.visible = false;
    this.scene.add(this.rampLine);

    // tool, radius (ft), strength (ft a second), target (ft, for set), terrace (ft), and the stamp's
    // shape, blend and height (ft).
    this.settings = { tool: "raise", radius: 256, strength: 60, target: 0, terrace: 50, shape: "hill", blend: "add", height: 200 };
    this.keys = { shift: false, ctrl: false };
    this.rampStart = null; // [x, h, z] of a ramp's first click
    this.undos = [];
    this.redos = [];
    this.stroke = null; // { before: Map of blockKey -> copy or null, button }
    this.pointer = null; // [sx, sy] in css pixels
    this.shown = false;
    this.placed = false;
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // Shows the land grid, looking at continent feet [x, z] the first time.
  show(grid, [x, z]) {
    this.shown = true;
    if (this.grid !== grid) {
      this.grid = grid;
      for (const mesh of this.blocks.values()) {
        this.land.remove(mesh);
        mesh.geometry.dispose();
      }
      this.blocks.clear();
      this.undos = [];
      this.redos = [];
      for (const key of grid.blocks.keys()) this.buildBlock(key);
    }
    if (!this.placed) {
      this.placed = true;
      this.controls.target.set(x, 0, z);
      this.camera.position.set(x, 3000, z + 3000);
      this.controls.update();
    }
    this.resize();
  }

  hide() {
    this.shown = false;
    this.stroke = null;
    this.cancel();
  }

  // Drops a ramp that's been started.
  cancel() {
    this.rampStart = null;
    this.rampLine.visible = false;
    this.render();
  }

  // Which of the heat map, contours and grid are drawn.
  setLayers({ heat, contours, grid }) {
    this.uniforms.uHeat.value = heat ? 1 : 0;
    this.uniforms.uContours.value = contours ? 1 : 0;
    this.uniforms.uGrid.value = grid ? 1 : 0;
    this.render();
  }

  setBrush(settings) {
    if (settings.tool && settings.tool !== this.settings.tool) this.cancel();
    Object.assign(this.settings, settings);
    this.updateRing();
  }

  // Whether shift and ctrl (or cmd) are held, which change what the tool does.
  setKeys(keys) {
    this.keys = keys;
  }

  // The ground point looked at, [x, z] in continent feet.
  get centre() {
    const { target } = this.controls;
    return [target.x, target.z];
  }

  get radius() {
    return this.settings.radius;
  }

  // The settings the next bit of sculpting uses, with shift and ctrl taken into account.
  effective() {
    const settings = { ...this.settings };
    const { tool } = settings;
    if (this.keys.shift && tool !== "stamp" && tool !== "ramp") return { ...settings, tool: "smooth" };
    if (!this.keys.ctrl) return settings;
    if (tool === "raise") settings.tool = "lower";
    else if (tool === "lower") settings.tool = "raise";
    else if (tool === "noise") settings.strength = -settings.strength;
    else if (tool === "stamp" && settings.blend === "add") settings.height = -settings.height;
    else if (tool === "stamp") settings.blend = settings.blend === "max" ? "min" : "max";
    return settings;
  }

  // Held-key moves from keyNav.js, as Overview.nudge.
  nudge(dt, { x, z, zoom, turn }) {
    const { target } = this.controls;
    const offset = this.camera.position.clone().sub(target);
    const distance = offset.length();
    const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    target.add(forward.multiplyScalar(-z).add(right.multiplyScalar(x)).multiplyScalar(distance * KEY_PAN * dt));
    if (turn) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * KEY_TURN * dt);
    if (zoom) offset.multiplyScalar(THREE.MathUtils.clamp(distance * Math.exp(-zoom * KEY_ZOOM * dt), MIN_DISTANCE_FT, MAX_DISTANCE_FT) / distance);
    this.camera.position.copy(target).add(offset);
    this.controls.update();
  }

  // --- sculpting ---

  bindPointer() {
    const canvas = this.canvas;
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.grid) return;
      this.pointer = at(e);
      this.keys = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      const settings = this.effective();
      const hit = this.groundUnder(this.pointer);
      if (settings.tool === "stamp" || settings.tool === "ramp") {
        if (hit) this.click(settings, hit);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      this.stroke = { before: new Map(), last: performance.now(), from: hit?.[1] ?? 0 };
      this.tick();
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = at(e);
      if (!this.stroke) this.updateRing();
    });
    const end = () => {
      if (!this.stroke) return;
      const { before } = this.stroke;
      this.stroke = null;
      this.finish(before);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => {
      if (this.stroke) return;
      this.pointer = null;
      this.updateRing();
    });
  }

  // While a stroke goes on: works the brush into the ground every frame.
  tick() {
    if (!this.stroke || !this.shown) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.stroke.last) / 1000);
    this.stroke.last = now;
    const hit = this.pointer && this.groundUnder(this.pointer);
    if (hit && dt > 0) this.apply(hit, dt);
    this.updateRing();
    requestAnimationFrame(() => this.tick());
  }

  // The brush at ground point [x, h, z], for dt seconds.
  apply([x, , z], dt) {
    this.change(brush(this.grid, this.effective(), [x, z], dt, this.stroke.from));
  }

  // A click with a stamp, or for one end of a ramp.
  click(settings, hit) {
    if (settings.tool === "ramp" && !this.rampStart) {
      this.rampStart = hit;
      this.updateRing();
      return;
    }
    this.stroke = { before: new Map() };
    if (settings.tool === "stamp") this.change(stamp(this.grid, settings, [hit[0], hit[2]]));
    else this.change(ramp(this.grid, this.rampStart, hit, settings.radius));
    const { before } = this.stroke;
    this.stroke = null;
    this.rampStart = null;
    this.finish(before);
    this.updateRing();
  }

  // Applies changes ([[gx, gz, h], ...]) during a stroke, keeping what they replace.
  change(changes) {
    if (!changes.length) return;
    let [gx0, gz0, gx1, gz1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [gx, gz, h] of changes) {
      this.keepBefore(gx, gz);
      this.grid.set(gx, gz, h);
      [gx0, gz0, gx1, gz1] = [Math.min(gx0, gx), Math.min(gz0, gz), Math.max(gx1, gx), Math.max(gz1, gz)];
    }
    this.refresh(gx0 - 1, gz0 - 1, gx1 + 1, gz1 + 1);
  }

  // Ends a stroke that kept `before`, for undoing it.
  finish(before) {
    if (!before.size) return;
    this.undos.push(before);
    if (this.undos.length > UNDO_STROKES) this.undos.shift();
    this.redos = [];
    this.onStroke?.();
  }

  // Keeps the block a point's in as it was before the stroke, for undoing it.
  keepBefore(gx, gz) {
    const key = blockKey(Math.floor(gx / BLOCK), Math.floor(gz / BLOCK));
    if (this.stroke.before.has(key)) return;
    this.stroke.before.set(key, this.grid.blocks.get(key)?.slice() ?? null);
  }

  undo() {
    this.swap(this.undos, this.redos);
  }

  redo() {
    this.swap(this.redos, this.undos);
  }

  // Puts back the blocks from the top of `from`, keeping how they are now on `to`.
  swap(from, to) {
    const blocks = from.pop();
    if (!blocks || this.stroke) return;
    const now = new Map();
    for (const [key, block] of blocks) {
      now.set(key, this.grid.blocks.get(key)?.slice() ?? null);
      if (block) this.grid.blocks.set(key, block);
      else this.grid.blocks.delete(key);
      this.grid.last = { key: NaN, block: null };
      // Its neighbours' sheets reach into it, so they're redone too.
      const [bx, bz] = [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
      this.buildBlock(key);
      this.refresh(bx * BLOCK, bz * BLOCK, (bx + 1) * BLOCK, (bz + 1) * BLOCK);
    }
    to.push(now);
    this.render();
    this.onStroke?.();
  }

  // The ground under a screen point, [x, h, z] in ft, or null: marches along the ray, in steps
  // that grow with distance, then closes in on where it crosses the ground.
  groundUnder([sx, sy]) {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), this.camera);
    const { origin, direction } = ray.ray;
    const above = (t) => origin.y + direction.y * t - this.grid.heightAt(origin.x + direction.x * t, origin.z + direction.z * t);
    let [t0, t] = [0, 0];
    if (above(0) < 0) return null;
    while (t < MAX_DISTANCE_FT * 2) {
      t0 = t;
      t += Math.max(4, t * 0.01);
      if (above(t) <= 0) {
        for (let i = 0; i < 20; i++) {
          const mid = (t0 + t) / 2;
          if (above(mid) > 0) t0 = mid;
          else t = mid;
        }
        const [x, z] = [origin.x + direction.x * t, origin.z + direction.z * t];
        return [x, this.grid.heightAt(x, z), z];
      }
    }
    return null;
  }

  // The brush's outline on the ground under the cursor, and the line a ramp would take.
  updateRing() {
    const hit = this.shown && this.grid && this.pointer ? this.groundUnder(this.pointer) : null;
    this.onPointer?.(hit);
    this.rampLine.visible = Boolean(this.rampStart && hit);
    if (this.rampLine.visible) {
      const [a, b] = [this.rampStart, hit];
      const points = new Float32Array([a[0], a[1] + 2, a[2], b[0], b[1] + 2, b[2]]);
      this.rampLine.geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      this.rampLine.geometry.computeBoundingSphere();
    }
    this.ring.visible = Boolean(hit);
    if (hit) {
      const n = 64;
      const points = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const [x, z] = [hit[0] + Math.cos(a) * this.radius, hit[2] + Math.sin(a) * this.radius];
        points.set([x, Math.max(0, this.grid.heightAt(x, z)) + 1, z], i * 3);
      }
      this.ring.geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      this.ring.geometry.computeBoundingSphere();
    }
    this.render();
  }

  // --- meshes ---

  // Redoes the blocks' meshes over grid points [gx0, gz0] to [gx1, gz1], making any that are new.
  refresh(gx0, gz0, gx1, gz1) {
    for (let bz = Math.floor((gz0 - 1) / BLOCK); bz <= Math.floor((gz1 + 1) / BLOCK); bz++) {
      for (let bx = Math.floor((gx0 - 1) / BLOCK); bx <= Math.floor((gx1 + 1) / BLOCK); bx++) {
        const key = blockKey(bx, bz);
        if (!this.grid.blocks.has(key)) continue;
        if (!this.blocks.has(key)) this.buildBlock(key);
        else this.fill(this.blocks.get(key), bx, bz, gx0 - 1, gz0 - 1, gx1 + 1, gz1 + 1);
      }
    }
    this.render();
  }

  // A block's sheet: BLOCK + 1 points a side, its last row and column from the blocks east and
  // south, so the sheets meet.
  buildBlock(key) {
    const old = this.blocks.get(key);
    if (old) {
      this.land.remove(old);
      old.geometry.dispose();
      this.blocks.delete(key);
    }
    if (!this.grid.blocks.has(key)) return;
    const [bx, bz] = [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];
    const n = BLOCK + 1;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(n * n * 3);
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) positions.set([(bx * BLOCK + a) * LAND_FT, 0, (bz * BLOCK + b) * LAND_FT], (b * n + a) * 3);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let b = 0; b < n - 1; b++) {
      for (let a = 0; a < n - 1; a++) {
        const v = b * n + a;
        indices.set([v, v + n, v + 1, v + 1, v + n, v + n + 1], k);
        k += 6;
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.userData.block = [bx, bz];
    this.fill(mesh, bx, bz, -Infinity, -Infinity, Infinity, Infinity);
    this.land.add(mesh);
    this.blocks.set(key, mesh);
  }

  // Sets a block mesh's heights and normals over grid points [gx0, gz0] to [gx1, gz1].
  fill(mesh, bx, bz, gx0, gz0, gx1, gz1) {
    const n = BLOCK + 1;
    const [ox, oz] = [bx * BLOCK, bz * BLOCK];
    const [a0, b0] = [Math.max(0, gx0 - ox), Math.max(0, gz0 - oz)];
    const [a1, b1] = [Math.min(n - 1, gx1 - ox), Math.min(n - 1, gz1 - oz)];
    const positions = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal;
    const grid = this.grid;
    for (let b = b0; b <= b1; b++) {
      for (let a = a0; a <= a1; a++) {
        const [gx, gz] = [ox + a, oz + b];
        const v = b * n + a;
        positions.array[v * 3 + 1] = grid.point(gx, gz);
        const dx = (grid.point(gx + 1, gz) - grid.point(gx - 1, gz)) / (2 * LAND_FT);
        const dz = (grid.point(gx, gz + 1) - grid.point(gx, gz - 1)) / (2 * LAND_FT);
        const length = Math.hypot(dx, 1, dz);
        normals.array.set([-dx / length, 1 / length, -dz / length], v * 3);
      }
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  // --- the camera ---

  // Keeps the point looked at on the ground and the camera above it, then draws.
  moved() {
    if (this.adjusting || !this.grid) return this.render();
    this.adjusting = true;
    const { target } = this.controls;
    const lift = Math.max(0, this.grid.heightAt(target.x, target.z)) - target.y;
    target.y += lift;
    this.camera.position.y += lift;
    const floor = Math.max(0, this.grid.heightAt(this.camera.position.x, this.camera.position.z)) + ABOVE_GROUND_FT;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.controls.update();
    this.adjusting = false;
    if (!this.stroke) this.updateRing();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (!this.shown || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// The ground, lit from the northwest: coloured by height on the heat map's log scale (or plain
// earth), with contour lines every 10, 50 and 250ft and the 32ft grid when asked, each fading out
// where its lines would crowd together.
function groundMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    extensions: { derivatives: true },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uHeat;
      uniform float uContours;
      uniform float uGrid;
      varying vec3 vPos;
      varying vec3 vNormal;
      vec3 heat(float h) {
        vec3 stops[8];
        stops[0] = vec3(0.19, 0.07, 0.23);
        stops[1] = vec3(0.27, 0.45, 0.93);
        stops[2] = vec3(0.1, 0.81, 0.8);
        stops[3] = vec3(0.45, 0.95, 0.35);
        stops[4] = vec3(0.96, 0.84, 0.22);
        stops[5] = vec3(0.92, 0.36, 0.08);
        stops[6] = vec3(0.6, 0.06, 0.03);
        stops[7] = vec3(0.98, 0.92, 0.92);
        float t = log(1.0 + max(0.0, h) / 20.0) / log(1.0 + ${TILE_FT * 41.25}.0 / 20.0);
        float f = min(1.0, t) * 7.0;
        int k = int(min(6.0, floor(f)));
        vec3 a = stops[0];
        vec3 b = stops[1];
        for (int i = 0; i < 7; i++) if (i == k) { a = stops[i]; b = stops[i + 1]; }
        return mix(a, b, f - float(k));
      }
      // How much a line every \`every\` units of v darkens here: 0 off it, up to 1 on it, fading
      // where lines come closer than a few pixels.
      float lines(float v, float every) {
        float u = v / every;
        float w = fwidth(u);
        float d = abs(fract(u - 0.5) - 0.5) / max(w, 1e-6);
        return (1.0 - smoothstep(0.5, 1.5, d)) * (1.0 - smoothstep(0.15, 0.35, w));
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        float light = 0.5 + 0.6 * max(0.0, dot(n, normalize(vec3(-1.0, 1.1, -0.7))));
        vec3 earth = vPos.y < 0.0 ? vec3(0.62, 0.58, 0.48) : vec3(0.55, 0.6, 0.42);
        vec3 color = mix(earth, vPos.y < 0.0 ? vec3(0.45, 0.42, 0.38) : heat(vPos.y), uHeat) * light;
        if (uContours > 0.5) {
          float c = max(lines(vPos.y, 10.0) * 0.35, max(lines(vPos.y, 50.0) * 0.6, lines(vPos.y, 250.0) * 0.85));
          color *= 1.0 - c * 0.6;
        }
        if (uGrid > 0.5) {
          float g = max(lines(vPos.x, ${LAND_FT}.0), lines(vPos.z, ${LAND_FT}.0));
          color = mix(color, vec3(1.0), g * 0.35);
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
