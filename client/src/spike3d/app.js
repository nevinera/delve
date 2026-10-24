import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { World } from "./world/world.js";
import { generateWorld, VILLAGE, GOBLIN_CAMP } from "./world/generate.js";
import { loadWorld, saveWorld, clearSavedWorld } from "./world/storage.js";
import { scatterProps } from "./world/scatter.js";
import { NAV_FT, NavGrid } from "./nav/navGrid.js";
import { nearestStandable } from "./nav/astar.js";
import { lineOfSight } from "./nav/los.js";
import { makeGroundTextures } from "./render/textures.js";
import { makeTerrainMaterial } from "./render/terrainMaterial.js";
import { TerrainMesher } from "./render/terrainMesher.js";
import { Water } from "./render/water.js";
import { Sky } from "./render/sky.js";
import { Props } from "./render/props.js";
import { makePlayerModel, makeWolfModel, makeGoblinModel } from "./render/unitModels.js";
import { LineOverlay, makeNavTexture, refreshNavTexture } from "./render/overlays.js";
import { Unit, UNIT_TYPES } from "./game/units.js";
import { MoveInput } from "./game/input.js";
import { WowCamera } from "./game/wowCamera.js";
import { EditorPanel } from "./editor/editorPanel.js";
import { applyBrush } from "./editor/brushes.js";
import { TILE_FT } from "./world/constants.js";

const MODELS = {player: makePlayerModel, wolf: makeWolfModel, goblin: makeGoblinModel};
const SPAWNS = [
  ["wolf", 930, 430], ["wolf", 955, 455],
  ["goblin", GOBLIN_CAMP.x, GOBLIN_CAMP.z - 22], ["goblin", GOBLIN_CAMP.x + 6, GOBLIN_CAMP.z + 24],
];
// Vision: fog fully closes at FOG.far, well inside the loaded 3x3 tiles.
const LOOK = {
  temperate: {fog: new THREE.Color(0xb7ccd8), top: new THREE.Color(0x5b8ac4), near: 220, far: 420, hemi: 1.15},
  swamp: {fog: new THREE.Color(0x76825f), top: new THREE.Color(0x56664c), near: 70, far: 260, hemi: 0.85},
};
const TAP_PX = 10;
const KEY_TURN_RATE = Math.PI; // rad/s
const BACKPEDAL = 0.6;
const STICK_DEADZONE = 0.12;
const FADE_RADIUS = 3.5; // feet around the player kept clear of props
const TAP_MS = 350;

export class App {
  constructor(root) {
    this.root = root;
    this.world = new World(3, 3);
    if (!loadWorld(this.world)) generateWorld(this.world);

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = "view";
    root.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 200, 400);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1000);

    this.hemi = new THREE.HemisphereLight(0xdde8ff, 0x5a4a32, 1.15);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
    this.sun.position.set(-0.6, 1, 0.35);
    this.scene.add(this.hemi, this.sun);

    this.sky = new Sky(this.scene);
    this.terrainMaterial = makeTerrainMaterial(makeGroundTextures(this.renderer), this.world);
    this.terrain = new TerrainMesher(this.world, this.terrainMaterial, this.scene);
    this.terrain.buildAll();
    this.water = new Water(this.world, this.scene);
    this.props = new Props(this.scene);
    this.scatter = scatterProps(this.world);
    this.props.update(this.scatter);
    this.nav = new NavGrid(this.world);
    this.nav.build(this.scatter.blockers);
    this.navTexture = makeNavTexture(this.nav);
    this.terrainMaterial.userData.uniforms.tNav.value = this.navTexture;
    this.overlay = new LineOverlay(this.scene);

    this.player = this.spawn("player", VILLAGE.x, VILLAGE.z + 10);
    this.npcs = SPAWNS.map(([kind, x, z]) => this.spawn(kind, x, z));
    this.units = [this.player, ...this.npcs];

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.wowCam = new WowCamera(this.camera, this.renderer.domElement);
    this.wowCam.yaw = this.player.heading;

    this.flags = {nav: false, los: true, paths: true, stats: true};
    this.mode = "play";
    this.paintMode = true;
    this.probe = null;
    this.brush = {name: "raise", radius: 16, x: 0, z: 0, active: false, target: 0};
    this.pending = {rect: null, layers: new Set(), timer: 0};
    this.time = 0;
    this.fps = 60;

    this.buildUi();
    this.setMode("play");
    this.bindPointer();
    this.world.onChange((rect, layers) => this.onWorldChange(rect, layers));
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.timer = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  spawn(kind, x, z) {
    const i = nearestStandable(this.nav, x, z, UNIT_TYPES[kind].radius, 40);
    const sx = i >= 0 ? ((i % this.nav.w) + 0.5) * NAV_FT : x;
    const sz = i >= 0 ? (Math.floor(i / this.nav.w) + 0.5) * NAV_FT : z;
    const unit = new Unit(kind, sx, sz, this.world);
    unit.heading = Math.random() * Math.PI * 2;
    unit.view = MODELS[kind]();
    this.scene.add(unit.view.root);
    return unit;
  }

  // --- UI -------------------------------------------------------------

  buildUi() {
    const bar = el("div", "s3-bar");
    this.modeBtn = button("Edit", () => this.setMode(this.mode === "play" ? "edit" : "play"));
    bar.append(this.modeBtn);
    this.flagBtns = {};
    for (const [flag, label] of [["nav", "Nav"], ["los", "LOS"], ["paths", "Paths"], ["stats", "Stats"]]) {
      const b = button(label, () => {
        this.flags[flag] = !this.flags[flag];
        b.classList.toggle("on", this.flags[flag]);
        this.terrainMaterial.userData.uniforms.uNavOn.value = this.flags.nav ? 1 : 0;
        this.stats.classList.toggle("hidden", !this.flags.stats);
      });
      b.classList.toggle("on", this.flags[flag]);
      this.flagBtns[flag] = b;
      bar.append(b);
    }
    bar.append(el("div", "s3-spacer"));
    bar.append(button("Save", () => {
      const ok = saveWorld(this.world);
      this.toast(ok ? "Saved to this browser" : "Save failed (storage full?)");
    }));
    bar.append(button("Reset", () => {
      if (!confirm("Throw away edits and regenerate the world?")) return;
      clearSavedWorld();
      location.reload();
    }));
    this.stats = el("div", "s3-stats");
    this.hint = el("div", "s3-hint");
    this.root.append(bar, this.stats, this.hint);
    this.input = new MoveInput(this.root);
    this.panel = new EditorPanel(this.root, this);
  }

  toast(text) {
    const t = el("div", "s3-toast");
    t.textContent = text;
    this.root.append(t);
    setTimeout(() => (t.style.opacity = 0), 1500);
    setTimeout(() => t.remove(), 2000);
  }

  setMode(mode) {
    this.mode = mode;
    this.modeBtn.textContent = mode === "play" ? "Edit" : "Play";
    this.modeBtn.classList.toggle("on", mode === "edit");
    this.input.setVisible(mode === "play");
    this.hint.classList.toggle("hidden", mode === "edit");
    this.panel.setVisible(mode === "edit");
    this.controls.enabled = mode === "edit";
    this.wowCam.enabled = mode === "play";
    if (mode === "edit") {
      this.controls.target.set(this.player.x, this.player.y + 4, this.player.z);
      const tx = Math.min(this.world.cols - 1, Math.floor(this.player.x / TILE_FT));
      const ty = Math.min(this.world.rows - 1, Math.floor(this.player.z / TILE_FT));
      this.panel.selectTile(tx, ty);
    }
    this.applyControlScheme();
  }

  applyControlScheme() {
    const c = this.controls;
    const painting = this.mode === "edit" && this.paintMode;
    c.enablePan = this.mode === "edit";
    c.minDistance = 10;
    c.maxDistance = this.mode === "edit" ? 700 : 140;
    c.maxPolarAngle = this.mode === "edit" ? 1.4 : 1.45;
    c.mouseButtons = painting
      ? {LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE}
      : {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN};
    c.touches = painting
      ? {ONE: null, TWO: THREE.TOUCH.DOLLY_PAN}
      : {ONE: THREE.TOUCH.ROTATE, TWO: this.mode === "edit" ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE};
    const touch = window.matchMedia("(pointer: coarse)").matches;
    this.hint.textContent = this.mode === "play"
      ? touch
        ? "Joystick to move · drag to look · pinch to zoom · tap ground to path"
        : "WASD · Q/E strafe · drag to look · right-drag to steer · wheel zoom · click to path"
      : "";
    this.panel.note.textContent = painting
      ? "Drag to paint · two fingers (or right-drag) for camera"
      : "Drag to orbit · two fingers to pan/zoom";
  }

  // --- pointer: tap-to-move, painting, probes ---------------------------

  bindPointer() {
    const canvas = this.renderer.domElement;
    const active = new Map();
    let down = null;
    canvas.addEventListener("pointerdown", (e) => {
      active.set(e.pointerId, e);
      down = active.size === 1 ? {x: e.clientX, y: e.clientY, t: performance.now(), button: e.button} : null;
      this.updateBrushFromEvent(e);
      if (active.size > 1) this.brush.active = false;
      else if (this.mode === "edit" && this.paintMode && e.button === 0 && this.brushPaints()) this.startStroke();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (active.has(e.pointerId)) active.set(e.pointerId, e);
      this.updateBrushFromEvent(e);
    });
    const up = (e) => {
      active.delete(e.pointerId);
      this.brush.active = false;
      if (!down || e.button !== down.button || down.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < TAP_PX && performance.now() - down.t < TAP_MS) this.tap(e);
      down = null;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", (e) => {
      active.delete(e.pointerId);
      this.brush.active = false;
      down = null;
    });
  }

  brushPaints() {
    return !["hut", "removeHut", "los"].includes(this.brush.name);
  }

  startStroke() {
    this.brush.active = true;
    this.brush.target = this.world.heightAt(this.brush.x, this.brush.z);
  }

  updateBrushFromEvent(e) {
    const hit = this.groundHit(e);
    if (!hit) return;
    this.brush.x = hit.x;
    this.brush.z = hit.z;
  }

  tap(e) {
    const hit = this.groundHit(e);
    if (!hit) return;
    if (this.mode === "play") {
      if (!this.player.pathTo(this, hit.x, hit.z)) this.toast("No path there");
      return;
    }
    if (!this.paintMode) return;
    if (this.brush.name === "los") {
      this.probe = {x: hit.x, y: this.world.heightAt(hit.x, hit.z) + 5.6, z: hit.z};
      return;
    }
    if (!this.brushPaints()) {
      const rot = Math.atan2(this.camera.position.x - hit.x, this.camera.position.z - hit.z);
      this.paint(hit.x, hit.z, 0, {rot});
    }
  }

  paint(x, z, dt, opts = {}) {
    const result = applyBrush(this.world, this.brush.name, x, z, this.brush.radius, dt, {target: this.brush.target, ...opts});
    if (result) this.world.changed(result.rect, result.layers);
  }

  // Where a screen point meets the ground, by marching the view ray over
  // the height function (no mesh raycasting needed).
  groundHit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const above = (t) => o.y + d.y * t - this.world.heightAt(o.x + d.x * t, o.z + d.z * t);
    let prev = 0;
    for (let t = 1; t < 1500; t += 2) {
      if (above(t) < 0) {
        let lo = prev, hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if (above(mid) < 0) hi = mid;
          else lo = mid;
        }
        const x = o.x + d.x * hi, z = o.z + d.z * hi;
        if (x < 0 || z < 0 || x > this.world.widthFt || z > this.world.depthFt) return null;
        return {x, z};
      }
      prev = t;
    }
    return null;
  }

  // --- edits -> rebuilds ------------------------------------------------

  onWorldChange(rect, layers) {
    let r = rect;
    if (layers.includes("theme")) {
      r = {x0: rect.x0 - 10, z0: rect.z0 - 10, x1: rect.x1 + 10, z1: rect.z1 + 10};
      this.water.refreshTheme();
    }
    if (layers.some((l) => l !== "object")) this.terrain.markDirty(r);
    const p = this.pending;
    p.rect = p.rect
      ? {x0: Math.min(p.rect.x0, r.x0), z0: Math.min(p.rect.z0, r.z0), x1: Math.max(p.rect.x1, r.x1), z1: Math.max(p.rect.z1, r.z1)}
      : {...r};
    layers.forEach((l) => p.layers.add(l));
    p.timer = 0.25;
    this.panel.minimap.stale = true;
  }

  // Props and nav are global passes, so they wait for a pause in editing.
  flushPending(dt) {
    const p = this.pending;
    if (!p.rect || this.brush.active) return;
    p.timer -= dt;
    if (p.timer > 0) return;
    this.scatter = scatterProps(this.world);
    this.props.update(this.scatter);
    const t0 = performance.now();
    this.nav.update(NavGrid.rectForCells(p.rect), this.scatter.blockers);
    refreshNavTexture(this.nav, this.navTexture);
    this.lastNavMs = performance.now() - t0;
    for (const u of this.units) u.path = null;
    p.rect = null;
    p.layers.clear();
  }

  // --- frame ------------------------------------------------------------

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    if (this.mode === "edit" && this.brush.active) this.paint(this.brush.x, this.brush.z, dt);
    const rebuilt = this.terrain.rebuildDirty(3);
    if (rebuilt.length) this.panel.minimap.flash(rebuilt);
    this.flushPending(dt);

    this.updateUnits(dt);
    this.updateCamera(dt);
    this.updateLook();
    this.drawOverlays();
    this.terrainMaterial.userData.uniforms.uTime.value = this.time;
    this.water.update(this.time);

    this.renderer.render(this.scene, this.camera);
    if (this.mode === "edit") this.panel.draw(this.units, this.brush);
    if (this.flags.stats) this.updateStats();
  }

  updateUnits(dt) {
    if (this.mode === "play") this.updatePlayer(dt);
    else this.player.updatePlayer(this, dt, {x: 0, z: 0});
    for (const npc of this.npcs) npc.updateNpc(this, dt);
    for (const u of this.units) {
      u.y = this.world.heightAt(u.x, u.z);
      u.view.root.position.set(u.x, u.y, u.z);
      u.view.root.rotation.y = u.heading;
      u.view.animate(dt, u.speed, u.attack);
    }
  }

  // WoW controls: W/S run and backpedal, A/D turn (strafe while
  // right-dragging), Q/E strafe, both mouse buttons run; right-drag also
  // turns the character to face where the camera looks. The joystick moves
  // relative to the camera instead, and the camera swings in behind.
  updatePlayer(dt) {
    const p = this.player, cam = this.wowCam, keys = this.input.keys;
    const held = (...names) => names.some((n) => keys.has(n));
    let forward = (held("w", "arrowup") ? 1 : 0) - (held("s", "arrowdown") ? 1 : 0);
    let strafe = (held("e") ? 1 : 0) - (held("q") ? 1 : 0);
    let turn = (held("a", "arrowleft") ? 1 : 0) - (held("d", "arrowright") ? 1 : 0);
    if (cam.bothButtons) forward = 1;
    if (cam.mouselook) {
      strafe -= turn;
      turn = 0;
      p.heading = cam.yaw;
    } else if (turn) {
      p.heading += turn * KEY_TURN_RATE * dt;
      if (!(cam.buttons & 1)) cam.yaw += turn * KEY_TURN_RATE * dt;
    }

    const stick = this.input.stick;
    if (Math.hypot(stick.x, stick.y) > STICK_DEADZONE) {
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      p.updatePlayer(this, dt, {x: fx * stick.y - fz * stick.x, z: fz * stick.y + fx * stick.x});
      if (!cam.touches.size) cam.follow(p.heading, dt);
      return;
    }
    if (forward || strafe) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      let x = fx * forward - fz * strafe, z = fz * forward + fx * strafe;
      const len = Math.hypot(x, z);
      x /= len;
      z /= len;
      p.updatePlayer(this, dt, {x, z}, {turnToMove: false, speedScale: forward < 0 ? BACKPEDAL : 1});
      return;
    }
    p.updatePlayer(this, dt, {x: 0, z: 0});
    if (p.speed > 0 && !cam.buttons && !cam.touches.size) cam.follow(p.heading, dt);
  }

  updateCamera(dt) {
    if (this.mode === "play") {
      const nav = this.nav;
      const blocked = (x, y, z) => {
        const sq = nav.squareAt(x, z);
        return sq >= 0 && nav.occluder[sq] > y;
      };
      this.wowCam.update(this.player, dt, this.world, blocked);
      this.player.view.root.visible = !this.wowCam.hidesPlayer;
      return;
    }
    this.controls.update();
    const cam = this.camera.position;
    const floor = this.world.heightAt(cam.x, cam.z) + 2.5;
    if (cam.y < floor) cam.y = floor;
  }

  // Fog, sky and light blend between themes based on where you stand.
  updateLook() {
    const focus = this.mode === "play" ? this.player : this.controls.target;
    const s = this.world.swampAt(focus.x, focus.z);
    const a = LOOK.temperate, b = LOOK.swamp;
    const fog = this.scene.fog;
    fog.color.copy(a.fog).lerp(b.fog, s);
    const stretch = this.mode === "edit" ? 2 : 1;
    fog.near = (a.near + (b.near - a.near) * s) * stretch;
    fog.far = (a.far + (b.far - a.far) * s) * stretch;
    this.scene.background = fog.color;
    this.hemi.intensity = a.hemi + (b.hemi - a.hemi) * s;
    this.sky.update(this.camera, new THREE.Color().copy(a.top).lerp(b.top, s), fog.color);
    const cam = this.camera.position;
    this.terrain.cull(cam.x, cam.z, fog.far + 20);
    this.props.cull(cam.x, cam.z, fog.far + 30);
    const fadeTo = this.mode === "play" ? new THREE.Vector3(this.player.x, this.player.y + 3, this.player.z) : this.controls.target;
    this.props.setFade(cam, fadeTo, FADE_RADIUS);
  }

  drawOverlays() {
    const o = this.overlay;
    o.begin();
    if (this.flags.los) {
      for (const npc of this.npcs) if (npc.los) o.sight(npc.eye(), this.player.eye(), npc.los);
      if (this.probe) {
        this.probe.y = this.world.heightAt(this.probe.x, this.probe.z) + 5.6;
        o.sight(this.player.eye(), this.probe, lineOfSight(this.world, this.nav, this.player.eye(), this.probe));
      }
    }
    if (this.flags.paths) {
      for (const u of this.units) if (u.path?.length) o.path(this.world, u, u.path, u === this.player);
    }
    if (this.mode === "edit") this.drawBrushRing(o);
    o.end();
  }

  drawBrushRing(o) {
    const {x, z, radius} = this.brush;
    const color = new THREE.Color(this.brush.active ? 0xffe060 : 0xffffff);
    const n = 40;
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      const p = {x: px, y: this.world.heightAt(px, pz) + 0.7, z: pz};
      if (prev) o.seg(prev, p, color);
      prev = p;
    }
  }

  updateStats() {
    const info = this.renderer.info.render;
    const tx = Math.floor(this.player.x / TILE_FT), ty = Math.floor(this.player.z / TILE_FT);
    const lines = [
      `${this.fps.toFixed(0)} fps  ${info.calls} calls  ${(info.triangles / 1000).toFixed(0)}k tris`,
      `tile ${tx},${ty}  (${this.player.x.toFixed(0)}, ${this.player.z.toFixed(0)})  h ${this.player.y.toFixed(1)}ft`,
      ...this.npcs.map((n) => `${n.kind.padEnd(6)} ${n.state.padEnd(6)} ${n.los ? (n.los.clear ? "sees" : `blocked: ${n.los.reason}`) : "far"}`),
    ];
    if (this.lastNavMs) lines.push(`nav rebuild ${this.lastNavMs.toFixed(0)}ms`);
    this.stats.textContent = lines.join("\n");
  }
}


function el(tag, className) {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function button(label, onClick) {
  const b = el("button", "s3-btn");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
