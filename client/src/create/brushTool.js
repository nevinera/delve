import * as THREE from "three";
import { CELLS, TURNS, noiseBrush, pullBrush, raiseBrush } from "./geo.js";
import { EMPTY_FT } from "./ground.js";
import { scatterPools } from "./marsh.js";

// Geo's brushes, raise and lower, flatten, smooth, noise, pools and clear, and planning's eraser:
// dragging on the ground works them where the pointer is, and a ring on the ground shows where
// they reach. [ and ] resize them, and c and v turn raise and lower's, shift+c and shift+v a
// little. Pools scatters small swamp pools in the ring (marsh.js) when clicked, and more each time
// the ring's moved its radius while dragged; its undo takes back the last scattering. The eraser
// cuts planning's lines where it passes.

export const BRUSHES = new Set(["raise", "flatten", "smooth", "noise", "pools", "clear", "eraser"]);

const MIN_RADIUS_FT = 16;
const MAX_RADIUS_FT = 16000;
const RING_POINTS = 96;
const TURN_DEG = 15;
const FINE_TURN_DEG = 2;

const $ = (id) => document.getElementById(id);
const pressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));

export class BrushTool {
  // tools: the Tools, for the pointer and where it meets the ground.
  constructor(tools, scene) {
    this.tools = tools;
    this.tool = null;
    this.settings = { shape: "round", radius: 0, strength: 0, noise: 0, lower: false, angle: 0, grain: 0, craggy: false };
    this.pools = { count: 0, size: 0 }; // the pools tool's settings
    this.poolUndos = []; // each scattering's pools and water bodies, latest last
    this.stroke = null; // { invert, from, at, view, scattered } while the left button's down
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe9a0, depthTest: false, transparent: true }));
    this.ring.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    this.ring.renderOrder = 10;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    scene.add(this.ring);

    const shapes = [...document.querySelectorAll(".create-shapes [data-shape]")];
    for (const button of shapes) {
      button.addEventListener("click", () => {
        this.settings.shape = button.dataset.shape;
        pressed(shapes, button);
        this.showAngle();
      });
    }
    const ways = [...document.querySelectorAll("[data-way]")];
    for (const button of ways) {
      button.addEventListener("click", () => {
        this.settings.lower = button.dataset.way === "lower";
        pressed(ways, button);
      });
    }
    const grains = [...document.querySelectorAll("[data-grain]")];
    for (const button of grains) {
      button.addEventListener("click", () => {
        this.settings.craggy = button.dataset.grain === "craggy";
        pressed(grains, button);
      });
    }
    $("brushSize").addEventListener("input", () => this.readSize());
    $("brushStrength").addEventListener("input", () => this.readStrength());
    $("brushAngle").addEventListener("input", () => this.turn((Number($("brushAngle").value) * Math.PI) / 180));
    $("brushNoise").addEventListener("input", () => this.readNoise());
    $("brushGrain").addEventListener("input", () => this.readGrain());
    $("poolsCount").addEventListener("input", () => this.readPools());
    $("poolsSize").addEventListener("input", () => this.readPools());
    $("poolsUndo").addEventListener("click", () => this.undoPools());
    this.readSize();
    this.readStrength();
    this.readNoise();
    this.readGrain();
    this.readPools();
    this.turn(0);
  }

  setTool(tool) {
    this.tool = tool;
    this.stroke = null;
    if (!tool) this.ring.visible = false;
    this.showAngle();
  }

  down(e) {
    const { tools } = this;
    const at = tools.hit(tools.drawAt);
    // Flatten pulls toward the ground's height where the stroke began.
    this.stroke = { invert: e.ctrlKey || e.metaKey, from: at ? tools.renditions.heightAt(at[0], at[2]) ?? EMPTY_FT : null };
    tools.marks.erased = false;
  }

  move() {
    if (this.stroke) this.stroke.at = null;
  }

  up() {
    this.stroke = null;
  }

  key(e) {
    if ((e.key === "c" || e.key === "C" || e.key === "v" || e.key === "V") && this.tool === "raise" && !e.ctrlKey && !e.metaKey) {
      const step = (e.shiftKey ? FINE_TURN_DEG : TURN_DEG) * (e.key.toLowerCase() === "c" ? -1 : 1);
      this.turn(this.settings.angle + (step * Math.PI) / 180);
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const size = $("brushSize");
      size.value = String(Number(size.value) + (e.key === "]" ? 50 : -50));
      this.readSize();
      return true;
    }
    return false;
  }

  // Shows where the brush reaches, and works it while the left button's down. While neither the
  // pointer nor the camera moves, a stroke keeps working where it was, though the ground it moved
  // now meets the pointer's ray somewhere else.
  tick(dt) {
    const { tools, tool, settings } = this;
    const { camera, renditions, ground } = tools;
    const view = camera.matrixWorld.elements.join();
    if (this.stroke?.view !== view) this.stroke &&= { ...this.stroke, view, at: null };
    const at = this.stroke?.at ?? tools.hit(tools.drawAt);
    if (this.stroke) this.stroke.at = at;
    this.ring.visible = Boolean(at);
    if (!at) return;
    const [x, , z] = at;
    if (this.stroke && tool === "eraser") {
      tools.marks.erase(x, z, settings.radius);
    } else if (this.stroke && dt > 0 && tool === "clear") {
      const cleared = renditions.clear(x, z, settings.radius);
      if (cleared.size) {
        ground.stale = true;
        ground.refresh(cleared);
      }
    } else if (this.stroke && tool === "pools") {
      const last = this.stroke.scattered;
      if (!last || Math.hypot(x - last[0], z - last[1]) >= settings.radius) {
        this.stroke.scattered = [x, z];
        this.scatter(x, z);
      }
    } else if (this.stroke && dt > 0 && (tool === "raise" || tool === "noise" || this.stroke.from !== null)) {
      const lower = settings.lower !== this.stroke.invert;
      const groundAt = (px, pz) => renditions.heightAt(px, pz) ?? EMPTY_FT;
      const brush =
        tool === "raise"
          ? raiseBrush({ ...settings, lower }, x, z, dt)
          : tool === "noise"
            ? noiseBrush({ ...settings, lower: this.stroke.invert }, x, z, dt)
            : pullBrush(tool, settings, x, z, dt, groundAt, this.stroke.from);
      ground.refresh(renditions.raise(brush.at, brush.bounds, brush.level));
    }
    this.drawRing(x, z, at);
  }

  drawRing(x, z, at) {
    const positions = this.ring.geometry.attributes.position;
    const lift = Math.max(1, this.tools.camera.position.distanceTo(new THREE.Vector3(...at)) * 0.002);
    // A turned shape's outline: half the ring, and back across the cut.
    const half = this.tool === "raise" && TURNS.has(this.settings.shape);
    const arc = half ? RING_POINTS / 2 : RING_POINTS;
    const { angle, radius } = this.settings;
    for (let k = 0; k < RING_POINTS; k++) {
      let px, pz;
      if (k <= arc) {
        const a = half ? angle - Math.PI / 2 + (k / arc) * Math.PI : (k / RING_POINTS) * Math.PI * 2;
        [px, pz] = [x + Math.cos(a) * radius, z + Math.sin(a) * radius];
      } else {
        const t = 1 - (2 * (k - arc)) / (RING_POINTS - arc);
        [px, pz] = [x - Math.sin(angle) * radius * t, z + Math.cos(angle) * radius * t];
      }
      positions.setXYZ(k, px, this.tools.drawAt(px, pz) + lift, pz);
    }
    positions.needsUpdate = true;
  }

  // Only raise and lower's shapes that look different turned have an angle.
  showAngle() {
    $("brushAngleRow").hidden = this.tool !== "raise" || !TURNS.has(this.settings.shape);
  }

  // Turns the brush to `angle` radians from east toward south.
  turn(angle) {
    this.settings.angle = angle - Math.floor(angle / (2 * Math.PI)) * 2 * Math.PI;
    const degrees = Math.round((this.settings.angle * 180) / Math.PI) % 360;
    $("brushAngleOut").textContent = `${degrees}°`;
    $("brushAngle").value = String(degrees);
  }

  readSize() {
    const t = Number($("brushSize").value) / 1000;
    this.settings.radius = Math.round(MIN_RADIUS_FT * (MAX_RADIUS_FT / MIN_RADIUS_FT) ** t);
    // Shown as the brush's width.
    $("brushSizeOut").textContent = `${(2 * this.settings.radius).toLocaleString()} ft`;
  }

  readStrength() {
    this.settings.strength = Number($("brushStrength").value) / 100;
    $("brushStrengthOut").textContent = `${$("brushStrength").value}%`;
  }

  readNoise() {
    this.settings.noise = Number($("brushNoise").value) / 100;
    $("brushNoiseOut").textContent = `${$("brushNoise").value}%`;
  }

  // Grain, 8 ft to 2,000, on a log scale.
  readGrain() {
    this.settings.grain = Math.round(8 * 250 ** (Number($("brushGrain").value) / 1000));
    $("brushGrainOut").textContent = `${this.settings.grain.toLocaleString()} ft`;
  }

  // How many pools a scattering tries for, and how big across they are, 8 ft to 120, on a log
  // scale.
  readPools() {
    this.pools.count = Number($("poolsCount").value);
    this.pools.size = Math.round(8 * 15 ** (Number($("poolsSize").value) / 1000));
    $("poolsCountOut").textContent = String(this.pools.count);
    $("poolsSizeOut").textContent = `${this.pools.size} ft`;
  }

  // Scatters pools in the ring at (x, z), kept to undo.
  scatter(x, z) {
    const { renditions, ground, water } = this.tools;
    const groundAt = (px, pz) => renditions.heightAt(px, pz) ?? EMPTY_FT;
    const wetAt = (px, pz) => renditions.waterAt(px, pz) !== null || Boolean(water.at(px, pz));
    const pools = scatterPools({ ...this.pools, radius: this.settings.radius }, x, z, groundAt, wetAt);
    if (!pools.length) return;
    const moved = new Set();
    for (const pool of pools) for (const key of renditions.raise(pool.at, pool.bounds, CELLS)) moved.add(key);
    ground.refresh(moved);
    const areas = water.addAreas("swamp", pools.map((p) => p.body));
    this.poolUndos.push({ pools, areas });
    $("poolsUndo").disabled = false;
  }

  undoPools() {
    const { renditions, ground, water } = this.tools;
    const last = this.poolUndos.pop();
    $("poolsUndo").disabled = !this.poolUndos.length;
    if (!last) return;
    const moved = new Set();
    for (const pool of last.pools) for (const key of renditions.raise(pool.undo, pool.bounds, CELLS)) moved.add(key);
    ground.refresh(moved);
    water.removeAreas(last.areas);
  }
}
