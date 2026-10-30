import * as THREE from "three";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { SHAPES, raiseBrush } from "./geo.js";

// The tools' sidebar: the type of work and its tools above, the picked tool's settings below. A
// picked tool takes the left button: dragging on the ground works it where the pointer is, and a
// ring on the ground shows where it reaches. Esc puts it down.

const MIN_RADIUS_FT = 16;
const MAX_RADIUS_FT = 16000;
const RING_POINTS = 96;
const PICK_FT = 30000; // how far off the pointer finds the ground

const $ = (id) => document.getElementById(id);

// Draws a shape's profile into a thumbnail.
function drawShape(canvas, shape) {
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#c8b48a";
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x++) g.lineTo(x, h - 2 - SHAPES[shape](Math.abs((2 * x) / w - 1)) * (h - 4));
  g.lineTo(w, h);
  g.fill();
}

export class Tools {
  constructor({ scene, camera, canvas, builder, renditions, ground }) {
    Object.assign(this, { camera, canvas, builder, renditions, ground });
    this.tool = null;
    this.settings = { shape: "round", radius: 0, strength: 0, noise: false, lower: false };
    this.pointer = null; // normalized device coordinates, or null off the view
    this.stroke = null; // { invert } while the left button's down
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe9a0, depthTest: false, transparent: true }));
    this.ring.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    this.ring.renderOrder = 10;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    scene.add(this.ring);

    for (const thumb of document.querySelectorAll("#side canvas[data-shape]")) drawShape(thumb, thumb.dataset.shape);
    const pressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));
    const toolButtons = [...document.querySelectorAll("[data-tool]")];
    for (const button of toolButtons) button.addEventListener("click", () => this.pick(this.tool === button.dataset.tool ? null : button.dataset.tool));
    const shapes = [...document.querySelectorAll(".create-shapes [data-shape]")];
    for (const button of shapes) {
      button.addEventListener("click", () => {
        this.settings.shape = button.dataset.shape;
        pressed(shapes, button);
      });
    }
    const ways = [...document.querySelectorAll("[data-way]")];
    for (const button of ways) {
      button.addEventListener("click", () => {
        this.settings.lower = button.dataset.way === "lower";
        pressed(ways, button);
      });
    }
    $("brushSize").addEventListener("input", () => this.readSize());
    $("brushStrength").addEventListener("input", () => this.readStrength());
    $("brushNoise").addEventListener("change", () => (this.settings.noise = $("brushNoise").checked));
    this.readSize();
    this.readStrength();
    this.settings.noise = $("brushNoise").checked;

    canvas.addEventListener("pointermove", (e) => this.point(e));
    canvas.addEventListener("pointerleave", () => (this.pointer = null));
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.tool) return;
      this.point(e);
      this.stroke = { invert: e.ctrlKey || e.metaKey };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointerup", () => (this.stroke = null));
    window.addEventListener("keydown", (e) => {
      if (e.target.matches?.("input, textarea, select")) return;
      if (e.key === "Escape") this.pick(null);
      else if ((e.key === "[" || e.key === "]") && this.tool) {
        const size = $("brushSize");
        size.value = String(Number(size.value) + (e.key === "]" ? 50 : -50));
        this.readSize();
      }
    });
    this.toolButtons = toolButtons;
  }

  pick(tool) {
    this.tool = tool;
    this.toolButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    for (const panel of document.querySelectorAll("[data-config]")) panel.hidden = panel.dataset.config !== (tool ?? "none");
    this.builder.paints = Boolean(tool);
    this.stroke = null;
  }

  readSize() {
    const t = Number($("brushSize").value) / 1000;
    this.settings.radius = Math.round(MIN_RADIUS_FT * (MAX_RADIUS_FT / MIN_RADIUS_FT) ** t);
    $("brushSizeOut").textContent = `${this.settings.radius.toLocaleString()} ft`;
  }

  readStrength() {
    this.settings.strength = Number($("brushStrength").value) / 100;
    $("brushStrengthOut").textContent = `${$("brushStrength").value}%`;
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  // Where the pointer meets the ground (or the sea), [x, y, z], or null.
  hit() {
    if (!this.pointer) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const { origin, direction } = ray.ray;
    const above = (t) => {
      const [x, z] = [origin.x + direction.x * t, origin.z + direction.z * t];
      return origin.y + direction.y * t - (this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT);
    };
    let [t0, t] = [0, 0];
    while (t < PICK_FT) {
      t0 = t;
      t += Math.max(2, t * 0.01);
      if (above(t) <= 0) break;
    }
    if (t >= PICK_FT || above(t) > 0) return null;
    for (let k = 0; k < 12; k++) {
      const mid = (t0 + t) / 2;
      if (above(mid) > 0) t0 = mid;
      else t = mid;
    }
    const p = origin.clone().addScaledVector(direction, t);
    return [p.x, p.y, p.z];
  }

  // Each frame: shows where the tool reaches, and works it while the left button's down.
  tick(dt) {
    const at = this.tool && this.hit();
    this.ring.visible = Boolean(at);
    if (!at) return;
    const [x, , z] = at;
    if (this.stroke && dt > 0) {
      const lower = this.settings.lower !== this.stroke.invert;
      const { at: move, bounds, level } = raiseBrush({ ...this.settings, lower }, x, z, dt);
      this.ground.refresh(this.renditions.raise(move, bounds, level));
    }
    const positions = this.ring.geometry.attributes.position;
    const lift = Math.max(1, this.camera.position.distanceTo(new THREE.Vector3(...at)) * 0.002);
    for (let k = 0; k < RING_POINTS; k++) {
      const a = (k / RING_POINTS) * Math.PI * 2;
      const [px, pz] = [x + Math.cos(a) * this.settings.radius, z + Math.sin(a) * this.settings.radius];
      positions.setXYZ(k, px, (this.renditions.heightAt(px, pz) ?? SEA_LEVEL_FT) + lift, pz);
    }
    positions.needsUpdate = true;
  }
}
