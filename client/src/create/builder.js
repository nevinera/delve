import * as THREE from "three";
import { TURN_RATE } from "../character/posed.js";
import { SEA_LEVEL_FT } from "../v2/sizes.js";

// The builder: a person who walks on the ground and flies over it, with a camera behind them.
//
// On the ground: W/S run forward and back, A/D turn, Q/E strafe, and space takes off. In the air:
// the same keys move, space rises and shift drops, and double-tapping either (holding the second
// press) does it fast. Touching the ground lands. Flying goes faster the higher you are, so you
// climb, sink and cross the land in about the same time whatever the height.
//
// Left-drag swings the camera round the builder, right-drag turns the builder with it, and the
// wheel zooms. The higher the builder flies, the more the camera looks down (cameraFor).

export const RUN_FT = 21; // a second
export const BACK_FT = 13.5;
export const FLY_FT = 21; // the least flying speed
export const FLY_PER_FT = 0.4; // flying speed for each foot above the ground, a second
export const CLIMB_FT = 24; // the least climbing speed
export const CLIMB_PER_FT = 0.8; // so height doubles about every 0.9 seconds
export const FAST = 2.5; // how much faster a double-tap climbs or drops
export const LIFT_FT = 1; // how far taking off rises at once
export const CEILING_FT = 20000;
const DOUBLE_TAP_MS = 300;
const EYE_FT = 5.5;
const CAMERA = { distance: 30, min: 4, max: 2000, pitch: 0.35, minPitch: -1.3, maxPitch: 1.45 };
// How the camera changes with height: tipped down by up to `tilt` radians, all of it by `tiltFt`
// up.
const ALOFT = { tilt: 0.7, tiltFt: 600 };
const DRAG = 0.006; // radians per pixel
const KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "shift"]);

// One step of the builder's moving. state: { x, y, z, yaw, flying }, continent feet and radians.
// input: { forward, strafe, turn } each -1, 0 or 1, rise and drop (space or shift held), fast (the
// held one was double-tapped), takeoff (space was just pressed). groundAt(x, z) gives the
// ground's height, or null off the tiles, where the sea's surface holds you up. Returns the new
// state.
export function moveBuilder(state, input, dt, groundAt) {
  const ground = (x, z) => groundAt(x, z) ?? SEA_LEVEL_FT;
  let { x, y, z, yaw, flying } = state;
  yaw += input.turn * TURN_RATE * dt;
  const above = Math.max(0, y - ground(x, z));
  if (!flying && input.takeoff) {
    flying = true;
    y += LIFT_FT;
  }
  const speed = flying ? Math.max(FLY_FT, above * FLY_PER_FT) : input.forward < 0 ? BACK_FT : RUN_FT;
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  let [mx, mz] = [fx * input.forward + fz * input.strafe, fz * input.forward - fx * input.strafe];
  const length = Math.hypot(mx, mz);
  if (length) {
    x += (mx / length) * speed * dt;
    z += (mz / length) * speed * dt;
  }
  if (flying) {
    const climb = Math.max(CLIMB_FT, above * CLIMB_PER_FT) * (input.fast ? FAST : 1);
    y = Math.min(CEILING_FT, y + ((input.rise ? 1 : 0) - (input.drop ? 1 : 0)) * climb * dt);
  }
  const floor = ground(x, z);
  if (!flying || y <= floor) {
    y = floor;
    flying = false;
  }
  return { x, y, z, yaw, flying };
}

// The camera's pitch and distance for the builder `above` feet over the ground, from the ones
// dragging and the wheel set.
export function cameraFor({ pitch, distance }, above) {
  const t = Math.min(1, Math.max(0, above) / ALOFT.tiltFt);
  return { pitch: Math.min(CAMERA.maxPitch, pitch + ALOFT.tilt * t * t * (3 - 2 * t)), distance };
}

// The builder in a scene, moved by the keys and followed by the camera.
export class Builder {
  // Starts at `state` (as moveBuilder takes it), or else on the ground at continent feet `at`.
  constructor({ scene, camera, canvas, groundAt, at, state }) {
    this.camera = camera;
    this.canvas = canvas;
    this.groundAt = groundAt;
    this.state = state ?? { x: at[0], y: groundAt(...at) ?? SEA_LEVEL_FT, z: at[1], yaw: Math.PI, flying: false };
    this.cam = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance };
    this.held = new Set();
    this.taps = {}; // key -> when it was last pressed
    this.fastKey = null;
    this.takeoff = false;
    this.paints = false; // whether a tool has the left button, leaving looking round to the right
    this.model = builderModel();
    scene.add(this.model);
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.held.clear());
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", () => (this.drag = null));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get above() {
    return this.state.y - (this.groundAt(this.state.x, this.state.z) ?? SEA_LEVEL_FT);
  }

  tick(dt) {
    const key = (k) => (this.held.has(k) ? 1 : 0);
    const input = {
      forward: key("w") - key("s"),
      strafe: key("q") - key("e"),
      turn: key("a") - key("d"),
      rise: this.held.has(" "),
      drop: this.held.has("shift"),
      fast: Boolean(this.fastKey && this.held.has(this.fastKey)),
      takeoff: this.takeoff,
    };
    this.takeoff = false;
    this.state = moveBuilder(this.state, input, dt, this.groundAt);
    if (this.drag?.button === 2) this.cam.yaw = 0;
    this.place();
  }

  // Puts the model where the builder is and the camera behind them, above the ground.
  place() {
    const { x, y, z, yaw } = this.state;
    this.model.position.set(x, y, z);
    this.model.rotation.y = yaw;
    const look = yaw + this.cam.yaw;
    const { pitch, distance } = cameraFor(this.cam, this.above);
    const head = new THREE.Vector3(x, y + EYE_FT, z);
    const away = new THREE.Vector3(-Math.sin(look) * Math.cos(pitch), Math.sin(pitch), -Math.cos(look) * Math.cos(pitch));
    const at = head.clone().addScaledVector(away, distance);
    const floor = (this.groundAt(at.x, at.z) ?? SEA_LEVEL_FT) + 2;
    if (at.y < floor) at.y = floor;
    this.camera.position.copy(at);
    this.camera.lookAt(at.clone().sub(away));
  }

  onKey(e, down) {
    if (e.target.matches?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (!KEYS.has(key)) return;
    e.preventDefault();
    if (!down) {
      this.held.delete(key);
      if (key === this.fastKey) this.fastKey = null;
      return;
    }
    if (e.repeat) return;
    this.held.add(key);
    const now = performance.now();
    if (key === " " || key === "shift") {
      if (now - (this.taps[key] ?? -Infinity) < DOUBLE_TAP_MS) this.fastKey = key;
      this.taps[key] = now;
    }
    if (key === " " && !this.state.flying) this.takeoff = true;
  }

  onDown(e) {
    if (e.button === 0 && this.paints) return;
    this.drag = { x: e.clientX, y: e.clientY, button: e.button };
    this.canvas.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    if (!this.drag) return;
    const [dx, dy] = [e.clientX - this.drag.x, e.clientY - this.drag.y];
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (this.drag.button === 2) this.state = { ...this.state, yaw: this.state.yaw - dx * DRAG };
    else this.cam.yaw -= dx * DRAG;
    this.cam.pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.cam.pitch + dy * DRAG));
  }

  onWheel(e) {
    e.preventDefault();
    this.cam.distance = Math.max(CAMERA.min, Math.min(CAMERA.max, this.cam.distance * Math.exp(e.deltaY * 0.001)));
  }
}

// A stand-in for the builder: a capsule with a nose, facing +z at yaw 0.
function builderModel() {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xe0a040 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4, 12), material);
  body.position.y = 3;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), material);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 4.5, 1.2);
  group.add(body, nose);
  return group;
}
