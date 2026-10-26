import * as THREE from "three";
import { parseTree } from "../world/trees.js";
import { blocks } from "../world/objects.js";

// Walk mode for the 3D view: a person-sized character on the generated ground, with a third-person
// camera, to get a feel for the land at eye level. Controls follow WoW: W/S run forward and back,
// A/D turn, Q/E strafe, space jumps, shift sprints; left-drag swings the camera around the character, right-drag
// turns the character with it, and the wheel zooms. Escape stops.
//
// The character keeps to the tiles drawn in full, can't climb slopes steeper than MAX_CLIMB or walk
// through tree trunks, and wades or swims where the water's deep. Positions are scene feet.

const RUN_FT = 21; // per second, about WoW's run speed
const BACK = 0.6; // backing up is slower
const SPRINT = 2;
const TURN = 2.6; // radians per second
const JUMP_FT = 16; // upward speed at takeoff, per second
const GRAVITY = 48;
const MAX_CLIMB = 1.2; // rise over run
const EYE_FT = 5.5;
const BODY_FT = 1; // the character's radius, for bumping into objects
const SWIM_DEPTH = 4.5; // how deep the feet go in water too deep to stand in
const CAMERA = { near: 0.5, distance: 22, min: 4, max: 90, pitch: 0.35, minPitch: -1.3, maxPitch: 1.3 };
const DRAG = 0.006; // radians per pixel

const KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "shift"]);

export class Walker {
  // view: the RenderView, for its scene, camera, canvas and decoded tiles.
  constructor(view, { onStop } = {}) {
    this.view = view;
    this.onStop = onStop;
    this.active = false;
    this.held = new Set();
    this.model = person();
    this.ray = new THREE.Raycaster();
    this.listeners = {
      keydown: (e) => this.onKey(e, true),
      keyup: (e) => this.onKey(e, false),
      blur: () => this.held.clear(),
    };
    this.pointer = {
      pointerdown: (e) => this.onDown(e),
      pointermove: (e) => this.onMove(e),
      pointerup: (e) => this.onUp(e),
      wheel: (e) => this.onWheel(e),
      contextmenu: (e) => e.preventDefault(),
    };
  }

  // Drops the character at scene position [x, z], facing away from the camera.
  start([x, z]) {
    if (this.active) return;
    const { camera } = this.view;
    this.pos = new THREE.Vector3(x, this.standHeight(x, z) ?? 0, z);
    this.vy = 0;
    this.yaw = Math.atan2(x - camera.position.x, z - camera.position.z);
    this.cam = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance };
    this.saved = { near: camera.near };
    camera.near = CAMERA.near;
    camera.updateProjectionMatrix();
    this.view.scene.add(this.model);
    for (const [name, fn] of Object.entries(this.listeners)) window.addEventListener(name, fn);
    for (const [name, fn] of Object.entries(this.pointer)) this.view.canvas.addEventListener(name, fn, { capture: true });
    this.active = true;
    this.last = null;
    requestAnimationFrame((t) => this.frame(t));
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.held.clear();
    this.drag = null;
    const { camera, controls } = this.view;
    camera.near = this.saved.near;
    camera.updateProjectionMatrix();
    this.view.scene.remove(this.model);
    for (const [name, fn] of Object.entries(this.listeners)) window.removeEventListener(name, fn);
    for (const [name, fn] of Object.entries(this.pointer)) this.view.canvas.removeEventListener(name, fn, { capture: true });
    controls.target.copy(this.pos);
    controls.update();
    this.view.render();
    this.onStop?.();
  }

  frame(now) {
    if (!this.active) return;
    const dt = this.last === null ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.step(dt);
    this.place();
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  step(dt) {
    const key = (k) => (this.held.has(k) ? 1 : 0);
    this.yaw += (key("a") - key("d")) * TURN * dt;
    const forward = key("w") - key("s");
    const strafe = key("q") - key("e");
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let mx = fx * forward + fz * strafe;
    let mz = fz * forward - fx * strafe;
    const length = Math.hypot(mx, mz);
    if (length > 0) {
      const speed = RUN_FT * (forward < 0 ? BACK : 1) * (this.held.has("shift") ? SPRINT : 1) * dt;
      mx = (mx / length) * speed;
      mz = (mz / length) * speed;
      // Try the whole step, then each axis alone, so you slide along what blocks you.
      for (const [dx, dz] of [[mx, mz], [mx, 0], [0, mz]]) {
        if (this.canStep(this.pos.x + dx, this.pos.z + dz)) {
          this.pos.x += dx;
          this.pos.z += dz;
          break;
        }
      }
    }

    const ground = this.standHeight(this.pos.x, this.pos.z) ?? this.pos.y;
    const onGround = this.pos.y <= ground + 0.01;
    if (onGround && this.held.has(" ")) this.vy = JUMP_FT;
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
    }
  }

  // Whether the character may move to (x, z): on a tile drawn in full, not into a tree trunk or
  // an object, and not up a slope too steep to climb.
  canStep(x, z) {
    const here = this.standHeight(this.pos.x, this.pos.z);
    const there = this.standHeight(x, z);
    if (there === null || this.cell(x, z)?.tree || this.objectAt(x, z)) return false;
    const run = Math.hypot(x - this.pos.x, z - this.pos.z);
    return here === null || run === 0 || (there - here) / run <= MAX_CLIMB || this.pos.y > there + 2;
  }

  // Where the feet rest at (x, z): the ground, or a swimming depth below the water's surface where
  // it's deeper than that. Null off the tiles drawn in full.
  standHeight(x, z) {
    const ground = this.groundAt(x, z);
    if (ground === null) return null;
    const water = this.cell(x, z)?.water;
    return Number.isFinite(water) && water - SWIM_DEPTH > ground ? water - SWIM_DEPTH : ground;
  }

  // Ground height at a scene position, smoothly between cell centers, or null off the full tiles.
  groundAt(x, z) {
    const { origin } = this.view;
    const any = this.view.decoded.values().next().value;
    if (!any) return null;
    const ft = any.cellFt;
    const u = (x + origin[0]) / ft - 0.5;
    const v = (z + origin[1]) / ft - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const h = (a, b) => this.cellAt(a, b)?.height ?? null;
    const corners = [h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)];
    if (corners.some((c) => c === null)) return h(Math.round(u), Math.round(v));
    const fu = u - i;
    const fv = v - j;
    const top = corners[0] + (corners[1] - corners[0]) * fu;
    const bottom = corners[2] + (corners[3] - corners[2]) * fu;
    return top + (bottom - top) * fv;
  }

  // An object in the way of a character at scene (x, z), on that tile or the ones beside it. One
  // the character is already inside (one placed on them, say) doesn't hold them in, and a jump
  // clears low ones.
  objectAt(x, z) {
    const { origin } = this.view;
    const any = this.view.decoded.values().next().value;
    if (!any) return null;
    const [cx, cz] = [x + origin[0], z + origin[1]];
    const [hx, hz] = [this.pos.x + origin[0], this.pos.z + origin[1]];
    const size = any.cells * any.cellFt;
    const [tx, tz] = [Math.floor(cx / size), Math.floor(cz / size)];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const object of this.view.decoded.get(`${tx + dx},${tz + dz}`)?.objects ?? []) {
          if (this.pos.y > (this.groundAt(x, z) ?? 0) + object.height * 0.9) continue;
          if (blocks(object, cx, cz, BODY_FT) && !blocks(object, hx, hz, BODY_FT)) return object;
        }
      }
    }
    return null;
  }

  cell(x, z) {
    const { origin } = this.view;
    const any = this.view.decoded.values().next().value;
    if (!any) return null;
    return this.cellAt(Math.floor((x + origin[0]) / any.cellFt), Math.floor((z + origin[1]) / any.cellFt));
  }

  // A cell by its continent cell position: { height, water, tree }, or null where no tile is drawn.
  cellAt(ci, cj) {
    const any = this.view.decoded.values().next().value;
    const n = any.cells;
    const tx = Math.floor(ci / n);
    const tz = Math.floor(cj / n);
    const tile = this.view.decoded.get(`${tx},${tz}`);
    if (!tile) return null;
    const k = (cj - tz * n) * n + (ci - tx * n);
    const water = tile.layers.water[k];
    return {
      height: tile.layers.height[k],
      water: Number.isNaN(water) ? null : water,
      tree: Boolean(parseTree(tile.palettes.terrain[tile.layers.terrain[k]])),
    };
  }

  // Puts the model and the camera where they belong. Trees between the head and the camera pull the
  // camera in, so it ducks under a canopy rather than looking down through it.
  place() {
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    const { camera } = this.view;
    const yaw = this.yaw + this.cam.yaw;
    const { pitch, distance } = this.cam;
    const head = this.pos.clone().add(new THREE.Vector3(0, EYE_FT, 0));
    const away = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    this.ray.set(head, away);
    this.ray.far = distance;
    const hit = this.ray.intersectObjects([...this.view.trees.children, ...this.view.objects.children], false)[0];
    camera.position.copy(head).addScaledVector(away, hit ? Math.max(1, hit.distance - 1) : distance);
    const floor = this.groundAt(camera.position.x, camera.position.z);
    if (floor !== null) camera.position.y = Math.max(camera.position.y, floor + 1.5);
    // Look the way the pitch says even when the ground has pushed the camera up, so from low down
    // you look up past the character at the sky.
    camera.lookAt(camera.position.clone().sub(away));
  }

  onKey(e, down) {
    const key = e.key.toLowerCase();
    if (e.target.matches?.("input, textarea, select")) return;
    if (down && key === "escape") {
      this.stop();
      return;
    }
    if (!KEYS.has(key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (down) this.held.add(key);
    else this.held.delete(key);
  }

  onDown(e) {
    e.stopImmediatePropagation();
    this.drag = { x: e.clientX, y: e.clientY, button: e.button };
    this.view.canvas.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    e.stopImmediatePropagation();
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (this.drag.button === 2) {
      // Right-drag turns the character, and the camera swings round behind it.
      this.yaw -= dx * DRAG;
      this.cam.yaw = 0;
    } else {
      this.cam.yaw -= dx * DRAG;
    }
    this.cam.pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.cam.pitch + dy * DRAG));
  }

  onUp(e) {
    e.stopImmediatePropagation();
    this.drag = null;
  }

  onWheel(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cam.distance = Math.max(CAMERA.min, Math.min(CAMERA.max, this.cam.distance * Math.exp(e.deltaY * 0.001)));
  }
}

// A plain stand-in person, 6 ft tall, with a lighter front so you can tell which way it faces.
function person() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x7a3b2e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.6, 4, 10), cloth);
  body.position.y = 2.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), skin);
  head.position.y = 5.1;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), skin);
  nose.position.set(0, 5.0, 0.75);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
  pack.position.set(0, 3.2, -0.9);
  group.add(body, head, nose, pack);
  return group;
}
