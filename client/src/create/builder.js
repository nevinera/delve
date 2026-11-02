import * as THREE from "three";
import { TURN_RATE } from "../character/posed.js";
import { CELL_FT, SEA_LEVEL_FT } from "../v2/sizes.js";
import { Figure } from "./figure.js";
import { WALK_DEG } from "./growth.js";

// The builder: a person (figure.js) who walks on the ground and flies over it, with a camera
// behind them.
//
// On the ground: W/S run forward and back, A/D turn, Q/E strafe, and space takes off. They can't
// walk up onto ground whose face is steeper than WALK_DEG, whichever way they go up it, and slide
// down it at SLIDE_FT where they're on it. In water
// deeper than SWIM_FT they swim, slower, floating with their feet that far under its surface, or
// anywhere under it: forward goes the way the camera looks, so looking down past where it rests
// dives and looking up rises, space swims up and F down, and they stay where they are when still,
// never over its surface nor under its bed; where it's shallower they stand. Walking off an edge
// higher than a step, they fall, and space while falling takes off. In the air: the same keys move,
// forward and back going the way the camera looks, up or down, as swimming does, and space rises
// and F falls. Touching the ground lands. Flying goes faster the higher you are over
// the land, slabs aside, so you climb, sink and cross the land in about the same time whatever the
// height. Double-tapping space, F or W and holding the second press goes FAST times as fast that
// way.
//
// Standing, double-tapping F takes them down into the earth, flying, where they're a ghost (ghost())
// till they come out of the rock; the camera stays under the ground with them. There, with no
// height to go faster by, holding the same keys goes faster the longer they're held, as fast as
// climbing that long would have them going (heightAfter).
//
// Left-drag swings the camera round the builder, right-drag turns the builder with it, both tip
// it up and down, and the wheel zooms. The higher the builder flies, the more the camera looks down (cameraFor).

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
export const CEILING_FT = 150000;
export const SLIDE_FT = 30; // a second, down ground too steep to walk on
export const GRAVITY_FT = 32; // a second, each second, falling
const STEEPEST = Math.tan((WALK_DEG * Math.PI) / 180); // rise over run
const DOUBLE_TAP_MS = 300;
const EYE_FT = 5.5;
const DIVE_FT = 8; // how far into the earth double-tapping F takes them at once, deep enough to be in its rock
export const CAMERA = { distance: 30, min: 4, max: 2000, pitch: 0.35, minPitch: -1.3, maxPitch: 1.45 };
// How the camera changes with height: tipped down by up to `tilt` radians, all of it by `tiltFt`
// up, then, from `highFt`, toward looking straight down, all the way at `topFt`, to plan from.
const ALOFT = { tilt: 0.7, tiltFt: 600, highFt: 20000, topFt: 100000 };
const DRAG = 0.006; // radians per pixel
const KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "f"]);
const MOVE_KEYS = ["w", "s", "q", "e", " ", "f"]; // the keys that move them, not turn them
const SWIM_LEVEL = 0.12; // how far, in radians, the camera can look either way of where it rests while swimming or flying on the level

// One step of the builder's moving. state: { x, y, z, yaw, flying, swimming, falling }, continent
// feet and radians, falling the speed they're falling at, feet a second, or 0. input: { forward, strafe, turn } each -1, 0 or 1, rise and drop (space or F held: 0, 1,
// or FAST double-tapped), ahead (how many times as fast forward goes, 1 or FAST), takeoff (space
// was just pressed), pitch, how far up the way they swim or fly goes, in radians, and above, how
// high over the land to fly as fast as, where it isn't how high they are. groundAt(x, z)
// gives the ground's height, or null off the tiles, where the sea's bed is SEA_LEVEL_FT, and
// waterAt(x, z) the water's surface there, or null where there's none. Walking, push(x, z) moves
// where they'd be out of what's in the way. landAt(x, z), the land's height without what's built
// on it, sets how fast flying goes. Returns the new state, with `swimming` whether they're in water
// deeper than SWIM_FT.
export function moveBuilder(state, input, dt, groundAt, push = (x, z) => [x, z], waterAt = () => null, landAt = groundAt) {
  const ground = (x, z) => standAt(x, z, groundAt, waterAt);
  const bed = (x, z) => groundAt(x, z) ?? SEA_LEVEL_FT;
  let { x, y, z, yaw, flying } = state;
  let falling = state.falling ?? 0;
  yaw += input.turn * TURN_RATE * dt;
  const above = input.above ?? Math.max(0, y - standAt(x, z, landAt, waterAt));
  let swimming = !flying && deep(x, z, groundAt, waterAt);
  if (!flying && !swimming && input.takeoff) {
    flying = true;
    falling = 0;
    y += LIFT_FT;
  }
  const speed = flying ? Math.max(FLY_FT, above * FLY_PER_FT) : (input.forward < 0 ? BACK_FT : RUN_FT) * (swimming ? SWIM_SPEED : 1);
  const ahead = input.forward > 0 ? (input.ahead ?? 1) : 1;
  const [rise, drop] = [Number(input.rise ?? 0), Number(input.drop ?? 0)];
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  // Swimming and flying, forward and back go up or down as far as the way they're going does.
  const level = swimming || flying ? Math.cos(input.pitch ?? 0) : 1;
  let [mx, mz] = [fx * input.forward * level + fz * input.strafe, fz * input.forward * level - fx * input.strafe];
  const length = Math.hypot(input.forward, input.strafe);
  if (length) {
    x += (mx / length) * speed * ahead * dt;
    z += (mz / length) * speed * ahead * dt;
    if (!flying) [x, z] = push(...offSteep(state.x, state.z, x, z, groundAt));
  }
  if (!flying && !swimming) [x, z] = slide(x, z, dt, groundAt);
  if (swimming) {
    const up = (length ? (input.forward * ahead * Math.sin(input.pitch ?? 0)) / length : 0) + rise - drop;
    y = Math.min(ground(x, z), Math.max(bed(x, z), y + up * speed * dt));
    // Where it's too shallow to swim, they stand.
    swimming = deep(x, z, groundAt, waterAt);
    if (!swimming) y = ground(x, z);
    return { x, y, z, yaw, flying: false, swimming, falling: 0 };
  }
  if (flying) {
    const climb = Math.max(CLIMB_FT, above * CLIMB_PER_FT);
    const up = length ? (input.forward * ahead * Math.sin(input.pitch ?? 0) * speed) / length : 0;
    y = Math.min(CEILING_FT, y + ((rise - drop) * climb + up) * dt);
  }
  const floor = ground(x, z);
  // Flying down into deep water, they swim where they come to.
  if (flying && deep(x, z, groundAt, waterAt) && y <= floor) return { x, y: Math.max(bed(x, z), y), z, yaw, flying: false, swimming: true, falling: 0 };
  if (flying && y <= floor) {
    y = floor;
    flying = false;
  } else if (!flying) {
    // Walking keeps to the ground down slopes and steps, as far as running could go down the
    // steepest of them; past that, they fall till they land.
    const step = Math.max(1, speed * dt * STEEPEST + 0.5);
    if (!falling && y - floor <= step) y = floor;
    else {
      falling += GRAVITY_FT * dt;
      y -= falling * dt;
      if (y <= floor) [y, falling] = [floor, 0];
    }
  }
  return { x, y, z, yaw, flying, swimming: !flying && deep(x, z, groundAt, waterAt), falling };
}

// How high over the land climbing from it for `seconds` takes the builder.
export function heightAfter(seconds) {
  const steady = CLIMB_FT / CLIMB_PER_FT; // the height climbing starts to speed up from
  const t = steady / CLIMB_FT;
  if (seconds <= t) return CLIMB_FT * seconds;
  return Math.min(CEILING_FT, steady * Math.exp(CLIMB_PER_FT * (seconds - t)));
}

// How steep the ground's face is at (x, z), rise over run.
export function steepness(x, z, groundAt) {
  const h = (a, b) => groundAt(a, b) ?? SEA_LEVEL_FT;
  const d = CELL_FT / 2;
  return Math.hypot(h(x + d, z) - h(x - d, z), h(x, z + d) - h(x, z - d)) / (2 * d);
}

// Where walking from (x0, z0) to (x, z) ends: there, or where it isn't up onto ground too steep,
// going only across or only along, or nowhere.
function offSteep(x0, z0, x, z, groundAt) {
  const from = groundAt(x0, z0) ?? SEA_LEVEL_FT;
  const fine = (a, b) => (groundAt(a, b) ?? SEA_LEVEL_FT) <= from || steepness(a, b, groundAt) <= STEEPEST;
  return [[x, z], [x, z0], [x0, z]].find(([a, b]) => fine(a, b)) ?? [x0, z0];
}

// Where standing at (x, z) for dt slides to, down the ground where it's too steep.
function slide(x, z, dt, groundAt) {
  const steep = steepness(x, z, groundAt);
  if (steep <= STEEPEST) return [x, z];
  const h = (a, b) => groundAt(a, b) ?? SEA_LEVEL_FT;
  const d = CELL_FT / 2;
  const [gx, gz] = [h(x + d, z) - h(x - d, z), h(x, z + d) - h(x, z - d)];
  const length = Math.hypot(gx, gz);
  return [x - (gx / length) * SLIDE_FT * dt, z - (gz / length) * SLIDE_FT * dt];
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
  const ease = (t) => (t = Math.min(1, Math.max(0, t))) * t * (3 - 2 * t);
  const low = Math.min(CAMERA.maxPitch, pitch + ALOFT.tilt * ease(above / ALOFT.tiltFt));
  const high = ease((above - ALOFT.highFt) / (ALOFT.topFt - ALOFT.highFt));
  return { pitch: low + (CAMERA.maxPitch - low) * high, distance };
}

// The builder in a scene, moved by the keys and followed by the camera.
export class Builder {
  // Starts at `state` (as moveBuilder takes it), or else on the ground at continent feet `at`.
  // landAt(x, z): the land's height, without what's built on it, for how fast flying goes and how
  // the camera looks down (moveBuilder's). clear(head, at): where the camera can be, looking from
  // `head` to `at`, kept out of rock. keep(was, now): the state to move to instead of `now`, from
  // `was`, where something's in the way that moveBuilder doesn't know of, told { soaring }, whether
  // space is double-tapped and held. ghost(): whether they're
  // a ghost, flying anywhere, through everything.
  constructor({ scene, camera, canvas, groundAt, landAt = groundAt, waterAt = () => null, at, state, push, clear = (head, to) => to, keep = (was, now) => now, ghost = () => false }) {
    this.push = push;
    this.ghost = ghost;
    this.keep = keep;
    this.landAt = landAt;
    this.clear = clear;
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
    this.dive = false; // F double-tapped standing
    [this.moving, this.holding] = ["", 0]; // the moving keys held, and for how long
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

  // How high they are over the land, slabs aside.
  get above() {
    return this.state.y - standAt(this.state.x, this.state.z, this.landAt, this.waterAt);
  }

  standAt(x, z) {
    return standAt(x, z, this.groundAt, this.waterAt);
  }

  tick(dt) {
    const key = (k) => (this.held.has(k) ? 1 : 0);
    const fast = (k) => (this.held.has(k) ? (this.fast.has(k) ? FAST : 1) : 0);
    // Swimming and flying go the way the camera's tipped, up or down, but for a little either way
    // of where it rests; not the way it looks down by itself, higher up.
    const tilt = CAMERA.pitch - this.cam.pitch;
    const pitch = Math.sign(tilt) * Math.min(Math.PI / 2, Math.max(0, Math.abs(tilt) - SWIM_LEVEL));
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
    // In the earth, the same keys held go faster the longer they are.
    const moving = MOVE_KEYS.filter((k) => this.held.has(k)).join("");
    this.holding = moving && moving === this.moving ? this.holding + dt : 0;
    this.moving = moving;
    if (this.ghost()) input.above = heightAfter(this.holding);
    this.takeoff = false;
    if (this.dive) {
      const { x, z } = this.state;
      this.state = { ...this.state, y: Math.min(this.state.y, this.landAt(x, z) ?? SEA_LEVEL_FT) - DIVE_FT, flying: true, swimming: false, falling: 0 };
      this.dive = false;
    }
    const was = this.state;
    this.state = this.ghost()
      ? moveBuilder({ ...this.state, flying: true }, input, dt, () => -Infinity, undefined, undefined, this.landAt)
      : this.keep(was, moveBuilder(this.state, input, dt, this.groundAt, this.push, this.waterAt, this.landAt), { soaring: this.fast.has(" ") });
    if (this.drag?.button === 2) this.cam.yaw = 0;
    const now = this.state;
    const speed = dt > 0 ? Math.hypot(now.x - was.x, now.z - was.z) / dt : 0;
    const swum = dt > 0 ? (now.y - was.y) / dt : 0;
    const afloat = now.swimming || now.flying;
    this.figure.update(dt, { ...now, forward: input.forward, strafe: input.strafe, turn: input.turn, speed: Math.hypot(speed, afloat ? swum : 0), climb: afloat && input.forward ? Math.atan2(swum, speed) : 0 });
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
    if (at.y < floor && !this.ghost()) at.y = floor;
    at.copy(this.clear(head, at));
    // In the earth, under the ground.
    if (this.ghost()) at.y = Math.min(at.y, (this.landAt(at.x, at.z) ?? SEA_LEVEL_FT) - 2);
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
    if (key === "f" && this.fast.has("f") && !this.state.flying && !this.state.swimming) this.dive = true;
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

  // The wheel zooms the camera, unless wheel(e), a tool's, takes it.
  onWheel(e) {
    e.preventDefault();
    if (this.wheel?.(e)) return;
    this.cam.distance = Math.max(CAMERA.min, Math.min(CAMERA.max, this.cam.distance * Math.exp(e.deltaY * 0.001)));
  }
}
