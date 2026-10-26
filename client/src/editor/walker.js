import * as THREE from "three";
import { blocks } from "../world/objects.js";
import { characterClips, loadAnimations } from "../character/animations.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { randomLook } from "../character/recipe.js";
import { trunkRadius } from "./treeMeshes.js";

// Walk mode for the 3D view: a person-sized character on the generated ground, with a third-person
// camera, to get a feel for the land at eye level. Controls follow WoW: W/S run forward and back,
// A/D turn, Q/E strafe, space jumps, / toggles walking, X sits; shift sprints, which WoW doesn't.
// Left-drag swings the camera around the character, right-drag turns the character with it, and
// the wheel zooms. Escape stops.
//
// Each walk is a new random character, weapons put away, animated to match how it moves. Strafing
// and running on the diagonal turn the legs part way toward the going and twist the chest back
// toward the front; backing up while strafing turns the other way.
//
// The character keeps to the tiles drawn in full, can't climb slopes steeper than MAX_CLIMB or walk
// through tree trunks, and wades or swims where the water's deep. Positions are scene feet.

// Speeds in feet per second, WoW's.
const RUN_FT = 21;
const WALK_FT = 7.5;
const BACK_FT = 13.5; // backing up at a run
const SWIM_FT = 14.2;
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

// Frames are drawn at most this often, so a fast display doesn't keep the GPU (shared with the rest
// of the screen) flat out. A little under the 60fps interval, so 60Hz displays don't drop frames.
const MIN_FRAME_MS = 1000 / 60 - 2;
const UP = new THREE.Vector3(0, 1, 0);
const KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "shift"]);
const TOGGLES = new Set(["/", "x"]);

// The clips for moving at each gait, ahead, to the left and right and back, and how far one
// stretches to match the character's speed before its feet are left to slide.
const GAITS = {
  walk: { ahead: "Walk_Loop", left: "Walk_Left_Loop", right: "Walk_Right_Loop", back: "Walk_Back_Loop" },
  run: { ahead: "Run_Fwd_Loop", left: "Run_Left_Loop", right: "Run_Right_Loop", back: "Run_Back_Loop" },
  sprint: { ahead: "Sprint_Loop", left: "Run_Left_Loop", right: "Run_Right_Loop", back: "Run_Back_Loop" },
};
const STRETCH = [0.6, 1.8];
const QUARTER = Math.PI / 4;
// How the chest twists against the legs, shared down the spine to the head.
const TWIST = [
  ["spine_01", 0.3],
  ["spine_02", 0.3],
  ["spine_03", 0.2],
  ["neck_01", 0.1],
  ["head", 0.1],
];
const TURN_LEAD = 0.35; // how far the chest and head lead a turn on the spot
const FADE_S = 0.2;
const AIRBORNE_S = 0.15; // off the ground this long, without jumping, is falling
const ROLL_FT = 30; // landing faster than this, or moving after a long fall, rolls
const LONG_FALL_S = 1.1;
const ONCE = { Jump_Start: { from: 0.1, speed: 1.5 }, Jump_Land: { speed: 1.6, length: 0.55 }, Roll: { speed: 1.5 }, Sit_Ground_Enter: {}, Sit_Ground_Exit: {} };

export class Walker {
  // view: the RenderView, for its scene, camera, canvas and decoded tiles.
  constructor(view, { onStop } = {}) {
    this.view = view;
    this.onStop = onStop;
    this.active = false;
    this.held = new Set();
    this.model = null; // the character, built from the character builder's look on each walk
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
    if (this.model) disposeCharacter(this.model);
    this.model = characterMesh({ ...randomLook(), sheathed: true });
    this.view.scene.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.bones = null;
    this.clips = null;
    this.playing = null;
    this.t = 0;
    this.facing = 0;
    this.twist = 0;
    this.turning = 0;
    this.gait = this.gait ?? "run";
    this.sitting = null;
    this.landing = null;
    this.airTime = 0;
    this.jumpedAt = -Infinity;
    const model = this.model;
    loadAnimations().then((baked) => {
      if (this.model !== model) return;
      this.clips = characterClips(model, baked);
    });
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
    if (this.last !== null && now - this.last < MIN_FRAME_MS) {
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    const dt = this.last === null ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) {
      this.step(dt);
      this.animate(dt);
    }
    this.place();
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  step(dt) {
    this.t += dt;
    const key = (k) => (this.held.has(k) ? 1 : 0);
    this.yaw += (key("a") - key("d")) * TURN * dt;
    // Which way it's turned since the last step, by keys or by dragging.
    this.turning = Math.sign(this.yaw - (this.lastYaw ?? this.yaw));
    this.lastYaw = this.yaw;
    const forward = key("w") - key("s");
    const strafe = key("q") - key("e");
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let mx = fx * forward + fz * strafe;
    let mz = fz * forward - fx * strafe;
    const length = Math.hypot(mx, mz);
    const swimming = this.swimming();
    const sprinting = this.held.has("shift") && !swimming;
    const gait = swimming ? "swim" : sprinting ? "sprint" : this.gait;
    const speed = length ? (swimming ? SWIM_FT : gait === "walk" ? WALK_FT : forward < 0 ? BACK_FT : RUN_FT) * (sprinting ? SPRINT : 1) : 0;
    this.motion = { forward, strafe, speed, gait, swimming };
    if (length > 0) {
      this.sitting = null;
      mx = (mx / length) * speed * dt;
      mz = (mz / length) * speed * dt;
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
    if (onGround && this.held.has(" ")) {
      this.vy = JUMP_FT;
      this.jumpedAt = this.t;
      this.sitting = null;
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      if (this.airTime > 0.3) this.land();
      this.airTime = 0;
    } else {
      this.airTime += dt;
    }
  }

  // Coming down: a roll when moving fast or after a long fall on the move, a crouch when standing
  // still, and straight on otherwise.
  land() {
    const { speed } = this.motion;
    if (speed > ROLL_FT || (speed > 0 && this.airTime > LONG_FALL_S)) this.landing = { clip: "Roll", until: this.t + 1 };
    else if (speed === 0) this.landing = { clip: "Jump_Land", until: this.t + ONCE.Jump_Land.length };
  }

  // Whether the character is swimming: held up at a depth in water too deep to stand in.
  swimming() {
    const ground = this.groundAt(this.pos.x, this.pos.z);
    const stand = this.standHeight(this.pos.x, this.pos.z);
    return ground !== null && stand > ground + 0.01 && this.pos.y <= stand + 0.01;
  }

  // Plays the clip for what the character is doing, and turns its body the way it's going.
  animate(dt) {
    const { forward, strafe, speed, gait, swimming } = this.motion;
    const moving = speed > 0;
    // The legs face a quarter turn toward a strafe, away from it when backing up, and the chest
    // twists back to the front.
    const facing = moving && !swimming ? strafe * QUARTER * (forward < 0 ? -1 : 1) : 0;
    const way = forward < 0 ? "back" : forward > 0 || !strafe ? "ahead" : strafe > 0 ? "left" : "right";
    const still = !moving && !this.sitting && !this.landing && this.airTime === 0;
    const twist = still ? this.turning * TURN_LEAD : -facing;
    const ease = Math.min(1, dt * 10);
    this.facing += (facing - this.facing) * ease;
    this.twist += (twist - this.twist) * ease;
    this.mixer.update(dt);
    if (!this.clips) return;

    if (this.landing && (this.t > this.landing.until || (moving && this.landing.clip !== "Roll"))) this.landing = null;
    const sat = this.sitting && this.t - this.sitting.at;
    if (this.sitting?.standing && sat > 1.1) this.sitting = null;
    if (swimming) this.play(moving ? "Swim_Fwd_Loop" : "Swim_Idle_Loop");
    else if (this.t - this.jumpedAt < 0.35) this.play("Jump_Start");
    else if (this.airTime > AIRBORNE_S || this.t - this.jumpedAt < 0.5) this.play("Jump_Loop");
    else if (this.landing) this.play(this.landing.clip);
    else if (this.sitting) this.play(this.sitting.standing ? "Sit_Ground_Exit" : sat < 1 ? "Sit_Ground_Enter" : "Sit_Ground_Idle_Loop");
    else if (moving) {
      const clip = (GAITS[gait] ?? GAITS.run)[way];
      const ground = (this.clips.get(clip)?.userData.speed ?? speed) * this.model.userData.scale;
      this.play(clip, Math.min(STRETCH[1], Math.max(STRETCH[0], speed / ground)));
    } else this.play(still && this.turning ? "Turn_Loop" : "Idle_Loop");
    this.twistChest();
  }

  // Twists the chest and head on top of whatever the clip has them doing.
  twistChest() {
    if (Math.abs(this.twist) < 0.01) return;
    this.bones ??= new Map(this.model.skeleton.bones.map((b) => [b.name, b]));
    const turn = new THREE.Quaternion();
    for (const [name, share] of TWIST) this.bones.get(name)?.quaternion.multiply(turn.setFromAxisAngle(UP, this.twist * share));
  }

  // Fades to a clip, or sets the playing one's speed. One-shot clips hold their last frame.
  play(name, speed = ONCE[name]?.speed ?? 1) {
    const clip = this.clips.get(name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.timeScale = speed;
    if (this.playing === name) return;
    const previous = this.playing && this.mixer.existingAction(this.clips.get(this.playing));
    this.playing = name;
    action.reset();
    action.setLoop(ONCE[name] ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.time = ONCE[name]?.from ?? 0;
    action.play();
    if (previous) action.crossFadeFrom(previous, FADE_S, false);
  }

  // Whether the character may move to (x, z): on a tile drawn in full, not into a tree trunk or
  // an object, and not up a slope too steep to climb.
  canStep(x, z) {
    const here = this.standHeight(this.pos.x, this.pos.z);
    const there = this.standHeight(x, z);
    if (there === null || this.trunkAt(x, z) || this.objectAt(x, z)) return false;
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

  // Whether a tree trunk is in the way of a character at scene (x, z), on that tile or the ones
  // beside it. Like objects, a trunk the character is already inside doesn't hold them in.
  trunkAt(x, z) {
    const any = this.view.decoded.values().next().value;
    if (!any) return false;
    const size = any.cells * any.cellFt;
    const { origin } = this.view;
    const [tx, tz] = [Math.floor((x + origin[0]) / size), Math.floor((z + origin[1]) / size)];
    this.trunks ??= new WeakMap(); // decoded tile -> its trunks as [x, z, radius]
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = this.view.decoded.get(`${tx + dx},${tz + dz}`);
        if (!tile) continue;
        if (!this.trunks.has(tile)) this.trunks.set(tile, this.view.treesOf(tile).map((t) => [t.x, t.z, trunkRadius(t.kind, t.size) + BODY_FT]));
        for (const [cx, cz, r] of this.trunks.get(tile)) {
          if (Math.hypot(x - cx, z - cz) < r && Math.hypot(this.pos.x - cx, this.pos.z - cz) >= r) return true;
        }
      }
    }
    return false;
  }

  cell(x, z) {
    const { origin } = this.view;
    const any = this.view.decoded.values().next().value;
    if (!any) return null;
    return this.cellAt(Math.floor((x + origin[0]) / any.cellFt), Math.floor((z + origin[1]) / any.cellFt));
  }

  // A cell by its continent cell position: { height, water }, or null where no tile is drawn.
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
    };
  }

  // Puts the model and the camera where they belong. Trees between the head and the camera pull the
  // camera in, so it ducks under a canopy rather than looking down through it.
  place() {
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw + this.facing;
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
    if (TOGGLES.has(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (down && !e.repeat) this.toggle(key);
      return;
    }
    if (!KEYS.has(key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (down) this.held.add(key);
    else this.held.delete(key);
  }

  // / switches between walking and running; X sits down, or stands back up.
  toggle(key) {
    if (key === "/") this.gait = this.gait === "walk" ? "run" : "walk";
    if (key !== "x" || this.motion?.speed || this.airTime > 0 || this.motion?.swimming) return;
    if (!this.sitting) this.sitting = { at: this.t };
    else if (!this.sitting.standing) this.sitting = { at: this.t, standing: true };
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
