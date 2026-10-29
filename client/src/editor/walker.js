import * as THREE from "three";
import { blocks, furnishingsOf } from "../world/objects.js";
import { BLOCKING, edgeDistance, edgesNear, floorAt, standOn, surfaceAt, tileWalk } from "../world/walkIndex.js";
import { CELL_FT as STRUCTURE_CELL_FT } from "../world/structures.js";
import { characterClips, loadAnimations } from "../character/animations.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { TURN_RATE } from "../character/posed.js";
import { randomLook } from "../character/recipe.js";
import { trunkRadius } from "./treeMeshes.js";

// Walk mode for the 3D view: a person-sized character on the generated ground, with a third-person
// camera, to get a feel for the land at eye level. Controls follow WoW: W/S run forward and back,
// A/D turn, Q/E strafe, space jumps, / toggles walking, X sits; Z toggles sprinting, which WoW
// doesn't have.
// Left-drag swings the camera around the character, right-drag turns the character with it, and
// the wheel zooms. Escape stops.
//
// Each walk is as `look` (a resolved character recipe), or else a new random character, weapons
// put away, animated to match how it moves. Strafing and running on the diagonal turn the legs part
// way toward the going and twist the chest back toward the front; backing up while strafing turns
// the other way.
//
// The character keeps to the tiles drawn in full, can't climb slopes steeper than MAX_CLIMB or walk
// through tree trunks, and wades or swims where the water's deep. On structures it walks their
// walk data (world/walkIndex.js): it stands on the highest floor, stair or roof within a step of
// its feet, steps up at most STEP_FT, and can't pass walls, windows or railings. Over a storey
// below ground the ground doesn't count, so it can go down into cellars. Positions are scene feet.

// Speeds in feet per second, WoW's.
export const RUN_FT = 21;
export const WALK_FT = 7.5;
export const BACK_FT = 13.5; // backing up at a run
export const SWIM_FT = 14.2;
export const SPRINT = 2;
const TURN = TURN_RATE; // radians per second, as the turning clips step round at
export const JUMP_FT = 16; // upward speed at takeoff, per second
export const GRAVITY = 48;
const MAX_CLIMB = 1.2; // rise over run
const EYE_FT = 5.5;
const BODY_FT = 1; // the character's radius, for bumping into objects
const STEP_FT = 1.5; // how high it steps up onto a structure's floor without jumping
const WALL_HALF_FT = 0.5; // how near a wall's middle line the body's edge can come
const SWIM_DEPTH = 4.5; // how deep the feet go in water too deep to stand in
const CAMERA = { near: 0.5, distance: 22, min: 4, max: 90, pitch: 0.35, minPitch: -1.3, maxPitch: 1.3 };
const DRAG = 0.006; // radians per pixel
// While the character moves, a camera swung round by left-dragging drifts back behind it, as WoW's
// does: it closes the gap at an exponential rate per second, and never slower than a least speed in
// radians per second, so the last of it doesn't crawl.
const CAMERA_FOLLOW = { rate: 2, least: 0.8 };

// Frames are drawn at most the view's frame rate cap a second (60 unless the graphics settings say
// less), so a fast display doesn't keep the GPU (shared with the rest of the screen) flat out. The
// interval is a little under the cap's, so a display at that rate doesn't drop frames.
export const frameDue = (last, now, fps) => last === null || now - last >= 1000 / fps - 2;
const UP = new THREE.Vector3(0, 1, 0);
const KEYS = new Set(["w", "a", "s", "d", "q", "e", " "]);
const TOGGLES = new Set(["/", "x", "z"]);

// The clips for moving at each gait, ahead, to the left and right and back, and how far one
// stretches to match the character's speed before its feet are left to slide.
export const GAITS = {
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
const TURN_LEAD = 0.12; // how far the chest and head lead a turn on the spot
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
    };
  }

  // Drops the character at scene position [x, z], facing away from the camera.
  start([x, z]) {
    if (this.active) return;
    const { camera } = this.view;
    this.pos = new THREE.Vector3(x, this.standHeight(x, z, Infinity) ?? 0, z);
    this.vy = 0;
    this.yaw = Math.atan2(x - camera.position.x, z - camera.position.z);
    this.cam = { yaw: 0, pitch: CAMERA.pitch, distance: CAMERA.distance };
    this.saved = { near: camera.near };
    camera.near = CAMERA.near;
    camera.updateProjectionMatrix();
    if (this.model) disposeCharacter(this.model);
    this.model = characterMesh({ ...(this.look ?? randomLook()), sheathed: true });
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
    if (!frameDue(this.last, now, this.view.graphics?.maxFps ?? 60)) {
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    const dt = this.last === null ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) {
      this.step(dt);
      this.animate(dt);
      this.view.onWalkFrame?.(dt);
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
    const sprinting = this.sprinting && !swimming;
    const gait = swimming ? "swim" : sprinting ? "sprint" : this.gait;
    const speed = length ? (swimming ? SWIM_FT : gait === "walk" ? WALK_FT : forward < 0 ? BACK_FT : RUN_FT) * (sprinting ? SPRINT : 1) : 0;
    this.motion = { forward, strafe, speed, gait, swimming };
    if (speed && this.drag?.button !== 0) {
      const off = Math.atan2(Math.sin(this.cam.yaw), Math.cos(this.cam.yaw));
      const close = Math.max(Math.abs(off) * (1 - Math.exp(-CAMERA_FOLLOW.rate * dt)), CAMERA_FOLLOW.least * dt);
      this.cam.yaw = Math.sign(off) * Math.max(0, Math.abs(off) - close);
    }
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
    const stand = this.stand(this.pos.x, this.pos.z);
    return Boolean(stand?.swim) && this.pos.y <= stand.height + 0.01;
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
    this.untwistChest();
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
    } else if (still && this.turning) this.play(this.turning > 0 ? "Turn_Left_Loop" : "Turn_Right_Loop");
    else this.play("Idle_Loop");
    this.twistChest();
  }

  // Twists the chest and head on top of whatever the clip has them doing.
  twistChest() {
    if (Math.abs(this.twist) < 0.01) return;
    this.bonesByName();
    const turn = new THREE.Quaternion();
    for (const [name, share] of TWIST) this.bones.get(name)?.quaternion.multiply(turn.setFromAxisAngle(UP, this.twist * share));
  }

  // Puts the twisted bones back as they rest, before the clip poses them. A clip leaves alone the
  // bones it has no track for, and they'd otherwise keep every frame's twist.
  untwistChest() {
    this.bonesByName();
    for (const [name] of TWIST) this.bones.get(name)?.quaternion.copy(this.restTurns.get(name));
  }

  bonesByName() {
    if (this.bones) return;
    this.bones = new Map(this.model.skeleton.bones.map((b) => [b.name, b]));
    this.restTurns = new Map(TWIST.filter(([name]) => this.bones.has(name)).map(([name]) => [name, this.bones.get(name).quaternion.clone()]));
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

  // Whether the character may move to (x, z): on a tile drawn in full, not into a tree trunk, an
  // object or a structure's wall, and not up a slope too steep to climb. Onto a structure it steps
  // up at most STEP_FT, or lands from above.
  canStep(x, z) {
    const here = this.standHeight(this.pos.x, this.pos.z);
    const there = this.stand(x, z);
    if (there === null || this.trunkAt(x, z) || this.objectAt(x, z) || this.wallAt(x, z)) return false;
    const rise = there.height - (here ?? there.height);
    if (there.structure) return rise <= STEP_FT || this.pos.y >= there.height - 0.01;
    const run = Math.hypot(x - this.pos.x, z - this.pos.z);
    return here === null || run === 0 || rise / run <= MAX_CLIMB || this.pos.y > there.height + 2;
  }

  // Where the feet rest at (x, z), for feet at `feet` (where they are now, unless said): see stand.
  standHeight(x, z, feet) {
    return this.stand(x, z, feet)?.height ?? null;
  }

  // Where the feet rest at (x, z), as { height, structure }: the ground, or a swimming depth below
  // the water's surface where it's deeper than that, or a structure's surface (structure true),
  // whichever is highest within a step of `feet` (walkIndex.js standOn). Null off the tiles drawn
  // in full.
  stand(x, z, feet = this.pos?.y ?? Infinity) {
    const groundY = this.groundAt(x, z);
    if (groundY === null) return null;
    const water = this.cell(x, z)?.water;
    const swim = Number.isFinite(water) && water - SWIM_DEPTH > groundY;
    const { surfaces, under } = this.structuresAt(x, z);
    const ground = under ? null : swim ? water - SWIM_DEPTH : groundY;
    const height = standOn(surfaces, ground, feet, STEP_FT);
    if (height === null) return null;
    return { height, structure: height !== ground, swim: swim && height === ground };
  }

  // The walk data of the structures on the tiles round scene (x, z): their surfaces' heights
  // there, and whether a storey below ground is under it.
  structuresAt(x, z) {
    const { origin } = this.view;
    const [cx, cz] = [x + origin[0], z + origin[1]];
    const key = `${Math.floor(cx / STRUCTURE_CELL_FT)},${Math.floor(cz / STRUCTURE_CELL_FT)}`;
    const surfaces = [];
    let under = false;
    for (const walk of this.walksNear(x, z)) {
      for (const cell of walk.cells.get(key) ?? []) surfaces.push(surfaceAt(cell, cx, cz));
      under ||= walk.under.has(key);
    }
    return { surfaces, under };
  }

  // The walk data (walkIndex.js tileWalk) of the tile at scene (x, z) and those beside it, each
  // worked out again when its objects change.
  // What's worked out from a tile's objects, kept while they stay the same: { objects, walk, all },
  // all being its objects with the ones in its structures. Undefined for a tile without objects.
  keptOf(tile) {
    if (!tile?.objects?.length) return undefined;
    this.walks ??= new WeakMap(); // decoded tile -> kept
    let kept = this.walks.get(tile);
    if (kept?.objects !== tile.objects) {
      kept = { objects: tile.objects, walk: tileWalk(tile.objects), all: tile.objects.flatMap((o) => [o, ...furnishingsOf(o)]) };
      this.walks.set(tile, kept);
    }
    return kept;
  }

  walksNear(x, z) {
    const any = this.view.decoded.values().next().value;
    if (!any) return [];
    const size = any.cells * any.cellFt;
    const { origin } = this.view;
    const [tx, tz] = [Math.floor((x + origin[0]) / size), Math.floor((z + origin[1]) / size)];
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const kept = this.keptOf(this.view.decoded.get(`${tx + dx},${tz + dz}`));
        if (kept?.walk.cells.size) out.push(kept.walk);
      }
    }
    return out;
  }

  // Whether a structure's wall, window or railing at the character's height is in the way of a
  // move to scene (x, z): one the body would come nearer than its edge allows. A wall it's
  // already too near doesn't stop it moving away.
  wallAt(x, z) {
    const walks = this.walksNear(x, z);
    if (!walks.length) return false;
    const { origin } = this.view;
    const [cx, cz] = [x + origin[0], z + origin[1]];
    const [hx, hz] = [this.pos.x + origin[0], this.pos.z + origin[1]];
    const feet = this.pos.y;
    for (const key of edgesNear(cx, cz)) {
      for (const walk of walks) {
        for (const edge of walk.edges.get(key) ?? []) {
          if (!BLOCKING.has(edge.kind) || edge.heights[0] >= feet + EYE_FT || edge.heights[1] <= feet + 0.5) continue;
          const near = edgeDistance(key, cx, cz);
          if (near < BODY_FT + WALL_HALF_FT && near < edgeDistance(key, hx, hz)) return true;
        }
      }
    }
    return false;
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

  // An object in the way of a character at scene (x, z), on that tile or the ones beside it,
  // structures' objects too. One the character is already inside (one placed on them, say)
  // doesn't hold them in, a jump clears low ones, and ones on another storey don't count.
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
        for (const object of this.keptOf(this.view.decoded.get(`${tx + dx},${tz + dz}`))?.all ?? []) {
          if (!blocks(object, cx, cz, BODY_FT) || blocks(object, hx, hz, BODY_FT)) continue;
          const bottom = object.y ?? this.seatOf(object);
          if (this.pos.y > bottom + object.height * 0.9 || this.pos.y + EYE_FT < bottom) continue;
          return object;
        }
      }
    }
    return null;
  }

  // How high a world object stands: on the structure floor under its middle, or the ground.
  seatOf(object) {
    const { origin } = this.view;
    const [x, z] = [object.at[0] - origin[0], object.at[1] - origin[1]];
    const ground = this.groundAt(x, z) ?? 0;
    for (const walk of this.walksNear(x, z)) {
      const floor = floorAt(walk, ...object.at, ground);
      if (floor !== ground) return floor;
    }
    return ground;
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
    // Kept above the ground, or in a cellar its floor; a structure's floor far above (a roof
    // overhead, say) doesn't push it up.
    const floor = this.stand(camera.position.x, camera.position.z, camera.position.y);
    if (floor && (!floor.structure || floor.height <= camera.position.y + STEP_FT)) camera.position.y = Math.max(camera.position.y, floor.height + 1.5);
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

  // / switches between walking and running; Z sprints, or stops; X sits down, or stands back up.
  toggle(key) {
    if (key === "/") this.gait = this.gait === "walk" ? "run" : "walk";
    if (key === "z") this.sprinting = !this.sprinting;
    if (key !== "x" || this.motion?.speed || this.airTime > 0 || this.motion?.swimming) return;
    if (!this.sitting) this.sitting = { at: this.t };
    else if (!this.sitting.standing) this.sitting = { at: this.t, standing: true };
  }

  onDown(e) {
    e.stopImmediatePropagation();
    // A finger drags as the right button does, turning the character with the camera, since a
    // phone has no other way to turn.
    this.drag = { x: e.clientX, y: e.clientY, button: e.pointerType === "touch" ? 2 : e.button };
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
