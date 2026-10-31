import * as THREE from "three";
import { TURN_RATE } from "../character/posed.js";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { Figure } from "./figure.js";

// The builder: a person (figure.js) who walks on the ground and flies over it, with a camera
// behind them.
//
// On the ground: W/S run forward and back, A/D turn, Q/E strafe, and space takes off. In water
// deeper than SWIM_FT they swim, slower, floating with their feet that far under its surface, or
// anywhere under it: forward goes the way the camera looks, so looking down past where it rests
// dives and looking up rises, space swims up and F down, and they stay where they are when still,
// never over its surface nor under its bed; where it's shallower they stand. In the air:
// the same keys move, space rises and F falls. Touching the ground lands. Flying goes faster the
// higher you are, so you climb, sink and cross the land in about the same time whatever the
// height. Double-tapping space, F or W and holding the second press goes FAST times as fast that
// way.
//
// Left-drag swings the camera round the builder, right-drag turns the builder with it, and the
// wheel zooms. The higher the builder flies, the more the camera looks down (cameraFor).

export const RUN_FT = 21; // a second
export const BACK_FT = 13.5;
export const SWIM_FT = 4; // water deeper than this is swum in
export const SWIM_SPEED = 0.67; // swimming's share of running's speed
export const FLY_FT = 21; // the least flying speed
export const FLY_PER_FT = 1; // flying speed for each foot above the ground, a second
export const CLIMB_FT = 24; // the least climbing speed
export const CLIMB_PER_FT = 0.8; // so height doubles about every 0.9 seconds
export const FAST = 3; // how much faster a double-tapped key goes
export const LIFT_FT = 1; // how far taking off rises at once
export const CEILING_FT = 20000;
const DOUBLE_TAP_MS = 300;
const EYE_FT = 5.5;
const CAMERA = { distance: 30, min: 4, max: 2000, pitch: 0.35, minPitch: -1.3, maxPitch: 1.45 };
// How the camera changes with height: tipped down by up to `tilt` radians, all of it by `tiltFt`
// up.
const ALOFT = { tilt: 0.7, tiltFt: 600 };
const DRAG = 0.006; // radians per pixel
const KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "f"]);
const SWIM_LEVEL = 0.12; // how far, in radians, the camera can look either way of where it rests while swimming on the level

// One step of the builder's moving. state: { x, y, z, yaw, flying, swimming }, continent feet and
// radians. input: { forward, strafe, turn } each -1, 0 or 1, rise and drop (space or F held: 0, 1,
// or FAST double-tapped), ahead (how many times as fast forward goes, 1 or FAST), takeoff (space
// was just pressed), and pitch, how far up the way they swim goes, in radians. groundAt(x, z)
// gives the ground's height, or null off the tiles, where the sea's bed is SEA_LEVEL_FT, and
// waterAt(x, z) the water's surface there, or null where there's none. Walking, push(x, z) moves
// where they'd be out of what's in the way. Returns the new state, with `swimming` whether they're
// in water deeper than SWIM_FT.
export function moveBuilder(state, input, dt, groundAt, push = (x, z) => [x, z], waterAt = () => null) {
  const ground = (x, z) => standAt(x, z, groundAt, waterAt);
  const bed = (x, z) => groundAt(x, z) ?? SEA_LEVEL_FT;
  let { x, y, z, yaw, flying } = state;
  yaw += input.turn * TURN_RATE * dt;
  const above = Math.max(0, y - ground(x, z));
  let swimming = !flying && deep(x, z, groundAt, waterAt);
  if (!flying && !swimming && input.takeoff) {
    flying = true;
    y += LIFT_FT;
  }
  const speed = flying ? Math.max(FLY_FT, above * FLY_PER_FT) : (input.forward < 0 ? BACK_FT : RUN_FT) * (swimming ? SWIM_SPEED : 1);
  const ahead = input.forward > 0 ? (input.ahead ?? 1) : 1;
  const [rise, drop] = [Number(input.rise ?? 0), Number(input.drop ?? 0)];
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  // Swimming, forward and back go up or down as far as the way they swim does.
  const level = swimming ? Math.cos(input.pitch ?? 0) : 1;
  let [mx, mz] = [fx * input.forward * level + fz * input.strafe, fz * input.forward * level - fx * input.strafe];
  const length = Math.hypot(input.forward, input.strafe);
  if (length) {
    x += (mx / length) * speed * ahead * dt;
    z += (mz / length) * speed * ahead * dt;
    if (!flying) [x, z] = push(x, z);
  }
  if (swimming) {
    const up = (length ? (input.forward * ahead * Math.sin(input.pitch ?? 0)) / length : 0) + rise - drop;
    y = Math.min(ground(x, z), Math.max(bed(x, z), y + up * speed * dt));
    // Where it's too shallow to swim, they stand.
    swimming = deep(x, z, groundAt, waterAt);
    if (!swimming) y = ground(x, z);
    return { x, y, z, yaw, flying: false, swimming };
  }
  if (flying) {
    const climb = Math.max(CLIMB_FT, above * CLIMB_PER_FT);
    y = Math.min(CEILING_FT, y + (rise - drop) * climb * dt);
  }
  const floor = ground(x, z);
  // Flying down into deep water, they swim where they come to.
  if (flying && deep(x, z, groundAt, waterAt) && y <= floor) return { x, y: Math.max(bed(x, z), y), z, yaw, flying: false, swimming: true };
  if (!flying || y <= floor) {
    y = floor;
    flying = false;
  }
  return { x, y, z, yaw, flying, swimming: !flying && deep(x, z, groundAt, waterAt) };
}

// Whether the water at (x, z) is deep enough to swim in.
function deep(x, z, groundAt, waterAt) {
  const water = waterAt(x, z);
  return water != null && water - (groundAt(x, z) ?? SEA_LEVEL_FT) > SWIM_FT;
}

// The height the builder stands at at (x, z): the ground's, or swimming, SWIM_FT under the water.
export function standAt(x, z, groundAt, waterAt = () => null) {
  const ground = groundAt(x, z) ?? SEA_LEVEL_FT;
  const water = waterAt(x, z);
  return water != null ? Math.max(ground, water - SWIM_FT) : ground;
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
  constructor({ scene, camera, canvas, groundAt, waterAt = () => null, at, state, push }) {
    this.push = push;
    this.waterAt = waterAt;
    this.camera = camera;
    this.canvas = canvas;
    this.groundAt = groundAt;
    this.state = state ?? { x: at[0], y: groundAt(...at) ?? SEA_LEVEL_FT, z: at[1], yaw: Math.PI, flying: false };
    this.cam = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance };
    this.held = new Set();
    this.taps = {}; // key -> when it was last pressed
    this.fast = new Set(); // the keys held since being double-tapped
    this.takeoff = false;
    this.paints = false; // whether a tool has the left button, leaving looking round to the right
    this.figure = new Figure(scene);
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
    return this.state.y - this.standAt(this.state.x, this.state.z);
  }

  standAt(x, z) {
    return standAt(x, z, this.groundAt, this.waterAt);
  }

  tick(dt) {
    const key = (k) => (this.held.has(k) ? 1 : 0);
    const fast = (k) => (this.held.has(k) ? (this.fast.has(k) ? FAST : 1) : 0);
    // Swimming goes the way the camera looks, up or down, but for a little either way of where it rests.
    const tilt = CAMERA.pitch - cameraFor(this.cam, this.above).pitch;
    const pitch = Math.sign(tilt) * Math.max(0, Math.abs(tilt) - SWIM_LEVEL);
    const input = {
      forward: key("w") - key("s"),
      strafe: key("q") - key("e"),
      turn: key("a") - key("d"),
      rise: fast(" "),
      drop: fast("f"),
      ahead: this.fast.has("w") ? FAST : 1,
      takeoff: this.takeoff,
      pitch,
    };
    this.takeoff = false;
    const was = this.state;
    this.state = moveBuilder(this.state, input, dt, this.groundAt, this.push, this.waterAt);
    if (this.drag?.button === 2) this.cam.yaw = 0;
    const now = this.state;
    const speed = dt > 0 ? Math.hypot(now.x - was.x, now.z - was.z) / dt : 0;
    const swum = dt > 0 ? (now.y - was.y) / dt : 0;
    this.figure.update(dt, { ...now, forward: input.forward, strafe: input.strafe, turn: input.turn, speed: Math.hypot(speed, now.swimming ? swum : 0), climb: now.swimming ? Math.atan2(swum, speed) : 0 });
    this.place();
  }

  // Puts the camera behind the builder, above the ground.
  place() {
    const { x, y, z, yaw } = this.state;
    const look = yaw + this.cam.yaw;
    const { pitch, distance } = cameraFor(this.cam, this.above);
    const head = new THREE.Vector3(x, y + EYE_FT, z);
    const away = new THREE.Vector3(-Math.sin(look) * Math.cos(pitch), Math.sin(pitch), -Math.cos(look) * Math.cos(pitch));
    const at = head.clone().addScaledVector(away, distance);
    // Over the ground, and over the water but while swimming.
    const floor = (this.state.swimming ? (this.groundAt(at.x, at.z) ?? SEA_LEVEL_FT) : this.standAt(at.x, at.z)) + 2;
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
      this.fast.delete(key);
      return;
    }
    if (e.repeat) return;
    this.held.add(key);
    const now = performance.now();
    if (now - (this.taps[key] ?? -Infinity) < DOUBLE_TAP_MS) this.fast.add(key);
    this.taps[key] = now;
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
