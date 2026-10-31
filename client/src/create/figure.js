import * as THREE from "three";
import { characterClips, loadAnimations } from "../character/animations.js";
import { characterMesh } from "../character/characterMesh.js";
import { randomLook } from "../character/recipe.js";

// The builder's figure: a character (character/characterMesh.js), weapons put away, animated to
// match how the builder moves. On the ground it runs, strafes, backs up and turns on the spot,
// its legs turned part way toward a strafe and its chest twisted back to the front; in deep water
// it swims, and in the air it swims too, as if through the air. Its look is picked at random the
// first time and kept in the browser after.

const LOOK_KEY = "create.look";
// The clips for running ahead, to the left and right and back, and how far one stretches to
// match the builder's speed before its feet are left to slide.
const GAIT = { ahead: "Run_Fwd_Loop", left: "Run_Left_Loop", right: "Run_Right_Loop", back: "Run_Back_Loop" };
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
const ONCE = { Jump_Land: { speed: 1.6, length: 0.55 } };
const UP = new THREE.Vector3(0, 1, 0);

export class Figure {
  constructor(scene) {
    this.model = characterMesh({ ...lookOf(), sheathed: true });
    scene.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.bones = new Map(this.model.skeleton.bones.map((b) => [b.name, b]));
    this.rest = new Map(TWIST.filter(([name]) => this.bones.has(name)).map(([name]) => [name, this.bones.get(name).quaternion.clone()]));
    [this.clips, this.playing, this.t, this.facing, this.twist, this.landing, this.flew] = [null, null, 0, 0, 0, null, false];
    loadAnimations().then((baked) => (this.clips = characterClips(this.model, baked)));
  }

  // Puts the figure at (x, y, z) facing `yaw`, and plays the clip for how it's moving: forward,
  // strafe and turn as the keys have them, -1, 0 or 1, speed in ft a second over the ground, and
  // whether it's flying or swimming.
  update(dt, { x, y, z, yaw, forward, strafe, turn, speed, flying, swimming }) {
    this.t += dt;
    const moving = speed > 0.1;
    const afloat = flying || swimming;
    // The legs face a quarter turn toward a strafe, away from it when backing up, and the chest
    // twists back to the front.
    const facing = moving && !afloat ? strafe * QUARTER * (forward < 0 ? -1 : 1) : 0;
    const way = forward < 0 ? "back" : forward > 0 || !strafe ? "ahead" : strafe > 0 ? "left" : "right";
    if (this.flew && !flying && !swimming) this.landing = this.t + ONCE.Jump_Land.length;
    this.flew = flying;
    if (this.landing && (this.t > this.landing || moving)) this.landing = null;
    const still = !moving && !afloat && !this.landing;
    const twist = still ? turn * TURN_LEAD : -facing;
    const ease = Math.min(1, dt * 10);
    this.facing += (facing - this.facing) * ease;
    this.twist += (twist - this.twist) * ease;
    this.model.position.set(x, y, z);
    this.model.rotation.y = yaw + this.facing;
    for (const [name, rest] of this.rest) this.bones.get(name).quaternion.copy(rest);
    this.mixer.update(dt);
    if (!this.clips) return;
    if (afloat) this.play(moving ? "Swim_Fwd_Loop" : "Swim_Idle_Loop");
    else if (this.landing) this.play("Jump_Land");
    else if (moving) {
      const clip = GAIT[way];
      const ground = (this.clips.get(clip)?.userData.speed ?? speed) * this.model.userData.scale;
      this.play(clip, Math.min(STRETCH[1], Math.max(STRETCH[0], speed / ground)));
    } else if (turn) this.play(turn > 0 ? "Turn_Left_Loop" : "Turn_Right_Loop");
    else this.play("Idle_Loop");
    // The chest and head twisted on top of whatever the clip has them doing.
    if (Math.abs(this.twist) < 0.01) return;
    const turned = new THREE.Quaternion();
    for (const [name, share] of TWIST) this.bones.get(name)?.quaternion.multiply(turned.setFromAxisAngle(UP, this.twist * share));
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
    action.play();
    if (previous) action.crossFadeFrom(previous, FADE_S, false);
  }
}

// The builder's look: kept in the browser, or picked at random and kept.
function lookOf() {
  try {
    const kept = JSON.parse(localStorage.getItem(LOOK_KEY));
    if (kept?.height) return kept;
  } catch {}
  const look = randomLook();
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {}
  return look;
}
