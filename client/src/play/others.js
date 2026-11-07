import * as THREE from "three";
import { characterClips, loadAnimations, roleClips, strideRate } from "../character/animations.js";
import { UpperBody, canSplit, halfOf } from "../character/upperBody.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { dummyMaterials, dummyMesh, disposeDummy } from "../world/dummy.js";
import { WeaponDraw } from "../character/weaponDraw.js";
import { TURN_RATE } from "../character/posed.js";
import { resolveRecipe } from "../character/recipe.js";
import { BACK_FT, GAITS, GRAVITY, JUMP_FT, RUN_FT, RUNNING_KINDS, SWIM_FT, tripAt, WALK_FT, walksDown } from "./walker.js";

// The other characters near you, as the game server reports them. Each carries on moving as it
// last said it was, between messages, and eases toward where each message says it is. Each has its
// name over its head, the same size on screen however far off, out to NAME_FT.

const STILL = { forward: 0, strafe: 0, turn: 0, gait: "run", swim: false, jump: false };
const RUNNING = { ...STILL, forward: 1 };
const CATCH_UP = 8; // how fast a drawn character closes the gap to where it should be, per second
const SNAP_FT = 40; // further off than this across the ground, it jumps there
const FADE_S = 0.2;
const SWING_FADE_S = 0.08; // into an ability's clip, so a quick swing isn't mostly a fade
const WEAPONS_OUT_MS = 6000; // how long weapons stay out after an ability
const NAME_FT = 300; // names show out to this far from the camera
const NAME_ABOVE_FT = 0.6; // how far over the head
const NAME_SCREEN = 0.035; // a name's height, as a share of the view's height
const NAME_PX = 48; // the name's drawn text size
const DUMMY_FT = 6.2; // a training dummy's height, for its name
let dummyLook = null; // the dummies' materials, shared

// How fast a `move` goes, in feet per second.
export function speedOf(move) {
  if (!move.forward && !move.strafe) return 0;
  if (move.swim) return SWIM_FT;
  return move.gait === "walk" ? WALK_FT : move.forward < 0 ? BACK_FT : RUN_FT;
}

// Where a character moving as `move`, facing `yaw`, goes in `dt` seconds: [dx, dz].
export function stepOf(move, yaw, dt) {
  const speed = speedOf(move);
  if (!speed) return [0, 0];
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  const mx = fx * move.forward + fz * move.strafe;
  const mz = fz * move.forward - fx * move.strafe;
  const length = Math.hypot(mx, mz);
  return [(mx / length) * speed * dt, (mz / length) * speed * dt];
}

// A seeded random, so someone's look fills in the same way each time they appear.
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// A character's name, with its level if it's a mob: players' levels show in frames, not over heads.
export function nameWithLevel({ id, name, level, dummy }) {
  return id < 0 && level && !dummy ? `${name} (${level})` : name;
}

// A name to hang over a character's head: white with a dark edge, readable over sky or ground,
// and not dimmed by fog.
function nameplate(name) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `600 ${NAME_PX}px system-ui, sans-serif`;
  ctx.font = font;
  const pad = NAME_PX / 4;
  canvas.width = Math.ceil(ctx.measureText(name).width + pad * 2);
  canvas.height = Math.ceil(NAME_PX * 1.3);
  ctx.font = font; // resizing the canvas resets it
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = NAME_PX / 6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(name, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, fog: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set((NAME_SCREEN * canvas.width) / canvas.height, NAME_SCREEN, 1);
  return sprite;
}

export class Others {
  // view: the RenderView you walk in.
  constructor(view) {
    this.view = view;
    this.characters = new Map(); // id -> drawn character
  }

  // Characters as the server sends them: { id, name, look, continent, at, yaw, move }.
  appear(character) {
    this.vanish(character.id);
    const look = resolveRecipe(character.look, seeded(character.id));
    // A training dummy is a still object, not a body.
    const dummy = Boolean(character.dummy);
    const model = dummy ? dummyMesh((dummyLook ??= dummyMaterials())) : characterMesh({ ...look, sheathed: true });
    const drawn = {
      id: character.id,
      name: character.name,
      look,
      own: character.look,
      class: character.class,
      level: character.level,
      dummy,
      dead: Boolean(character.dead),
      health: character.health,
      maxHealth: character.maxHealth,
      model,
      nameplate: nameplate(nameWithLevel(character)),
      height: dummy ? DUMMY_FT : look.height,
      mixer: new THREE.AnimationMixer(model),
      clips: null,
      playing: null,
      vy: 0,
      shown: new THREE.Vector3(...character.at),
    };
    this.update(drawn, character);
    if (!dummy)
      loadAnimations().then((baked) => {
        if (this.characters.get(drawn.id) === drawn) drawn.clips = characterClips(model, baked);
      });
    this.characters.set(drawn.id, drawn);
    this.view.scene.add(model, drawn.nameplate);
  }

  // A mob died: it falls, and lies there until it comes back.
  died(id) {
    const drawn = this.characters.get(id);
    if (!drawn) return;
    drawn.dead = true;
    drawn.diedAt = performance.now();
    drawn.health = 0;
  }

  moved(message) {
    const drawn = this.characters.get(message.id);
    if (drawn) this.update(drawn, message);
  }

  // Someone's look changed, or went back to their own if it's null.
  look({ id, look }) {
    const drawn = this.characters.get(id);
    if (!drawn) return;
    const { name, class: classId, level, dummy, dead, health, maxHealth, dps, at, yaw, move, own } = drawn;
    this.appear({ id, name, look: look ?? own, class: classId, level, dummy, dead, health, maxHealth, at: [at.x, at.y, at.z], yaw, move });
    const next = this.characters.get(id);
    next.own = own;
    next.dps = dps;
    next.transformed = Boolean(look);
  }

  // What someone holds changed, which shows now unless they look like something else.
  gear({ id, look }) {
    const drawn = this.characters.get(id);
    if (!drawn) return;
    drawn.own = look;
    if (!drawn.transformed) this.look({ id, look: null });
  }

  // An effect is carrying someone: they're at `at` as far as the server goes, and this plays the trip.
  forced({ id, kind, from, at, yaw, seconds, height }) {
    const drawn = this.characters.get(id);
    if (!drawn) return;
    drawn.at = new THREE.Vector3(...at);
    drawn.yaw = yaw;
    drawn.vy = 0;
    drawn.move = STILL;
    drawn.trip = { from: new THREE.Vector3(...from), to: drawn.at.clone(), seconds, height, t: 0, move: RUNNING_KINDS.includes(kind) ? RUNNING : STILL };
  }

  update(drawn, { at, yaw, move }) {
    drawn.trip = null;

    drawn.at = new THREE.Vector3(...at);
    drawn.yaw = yaw;
    drawn.move = move;
    if (move.jump) drawn.vy = JUMP_FT;
    // Across the ground only: a height that's off (a bot's, say) is put right each frame.
    if (Math.hypot(drawn.shown.x - drawn.at.x, drawn.shown.z - drawn.at.z) > SNAP_FT) drawn.shown.copy(drawn.at);
  }

  vanish(id) {
    const drawn = this.characters.get(id);
    if (!drawn) return;
    this.view.scene.remove(drawn.model, drawn.nameplate);
    if (drawn.dummy) disposeDummy(drawn.model);
    else disposeCharacter(drawn.model);
    drawn.nameplate.material.map.dispose();
    drawn.nameplate.material.dispose();
    this.characters.delete(id);
  }

  clear() {
    for (const id of [...this.characters.keys()]) this.vanish(id);
  }

  // Moves everyone on by dt seconds and poses them. Called each frame of the walk.
  frame(dt) {
    const { origin, walker } = this.view;
    if (!origin) return;
    for (const drawn of this.characters.values()) {
      if (drawn.trip) {
        drawn.trip.t += dt;
        const { position, done } = tripAt(drawn.trip);
        drawn.shown.copy(position);
        this.draw(drawn, dt, drawn.trip.move);
        if (done) drawn.trip = null;
        continue;
      }
      const { move } = drawn;
      drawn.yaw += move.turn * TURN_RATE * dt;
      const [dx, dz] = stepOf(move, drawn.yaw, dt);
      drawn.at.x += dx;
      drawn.at.z += dz;
      // Up in the air after a jump, then down to whatever's under them.
      // What's under them near the height they said, or the top of what's there when that's off
      // (a bot that doesn't know the ground, say).
      const [sx, sz] = [drawn.at.x - origin[0], drawn.at.z - origin[1]];
      const ground = walker?.standHeight(sx, sz, drawn.at.y + 2) ?? walker?.standHeight(sx, sz, Infinity);
      if (ground === null || ground === undefined) drawn.vy = 0; // off the land drawn: as they said
      else {
        if (drawn.vy === 0 && walksDown(drawn.at.y - ground, Math.hypot(dx, dz))) drawn.at.y = ground;
        drawn.vy -= GRAVITY * dt;
        drawn.at.y += drawn.vy * dt;
        if (drawn.at.y <= ground) [drawn.at.y, drawn.vy] = [ground, 0];
      }
      drawn.airborne = ground !== null && ground !== undefined && drawn.at.y > ground + 0.5;
      drawn.shown.lerp(drawn.at, Math.min(1, CATCH_UP * dt));
      this.draw(drawn, dt, move);
    }
  }

  draw(drawn, dt, move) {
    const { origin } = this.view;
    drawn.model.position.set(drawn.shown.x - origin[0], drawn.shown.y, drawn.shown.z - origin[1]);
    drawn.model.rotation.y = drawn.yaw;
    drawn.nameplate.position.copy(drawn.model.position).y += drawn.height + NAME_ABOVE_FT;
    drawn.nameplate.visible = drawn.nameplate.position.distanceTo(this.view.camera.position) < NAME_FT;
    this.animate(drawn, dt, move);
  }

  animate(drawn, dt, move) {
    drawn.mixer.update(dt);
    if (drawn.dummy || !drawn.clips) return;
    if (drawn.dead) {
      // It plays its death once. One seen dead on arriving is already lying there.
      const death = roleClips(drawn.model.userData.look, drawn.model.userData.skeleton).death;
      const fell = drawn.diedAt === undefined ? Infinity : (performance.now() - drawn.diedAt) / 1000;
      drawn.acting = null;
      drawn.upper?.clear();
      drawn.legsOnly = false;
      if (death) this.play(drawn, death, 1, true, Math.min(fell, drawn.clips.get(death)?.duration ?? 0));
      return;
    }
    const speed = speedOf(move);
    const now = performance.now();
    if (drawn.acting) drawn.weaponsUntil = now + WEAPONS_OUT_MS;
    const weaponsOut = now < (drawn.weaponsUntil ?? 0);
    drawn.hands ??= new WeaponDraw(drawn.model);
    const reaching = drawn.hands.update(now / 1000, weaponsOut);
    const busy = speed || drawn.airborne;
    if (drawn.acting && (drawn.acting.until <= now || move.swim || (busy && !canSplit(drawn.model)))) drawn.acting = null;
    // On the move, an ability plays on the arms over what the legs are doing, and reaching for a
    // weapon always does.
    drawn.upper ??= new UpperBody(drawn.mixer, drawn.clips);
    const arms = reaching ?? (busy ? drawn.acting : null);
    drawn.legsOnly = Boolean(arms);
    if (reaching) drawn.upper.show(reaching, reaching.name, { time: now / 1000 - reaching.at, once: true });
    else if (arms) drawn.upper.show(arms, arms.name, { time: (now - arms.at) / 1000, once: !arms.loop });
    else drawn.upper.clear();
    if (drawn.acting && !arms) {
      this.play(drawn, drawn.acting.name, drawn.acting.speed, !drawn.acting.loop, ((now - drawn.acting.at) / 1000) * drawn.acting.speed);
      return;
    }
    const way = move.forward < 0 ? "back" : move.forward > 0 || !move.strafe ? "ahead" : move.strafe > 0 ? "left" : "right";
    let clip = weaponsOut ? (roleClips(drawn.model.userData.look, drawn.model.userData.skeleton).ready ?? "Idle_Loop") : "Idle_Loop";
    if (move.swim) clip = speed ? "Swim_Fwd_Loop" : "Swim_Idle_Loop";
    else if (drawn.airborne) clip = "Jump_Loop";
    else if (speed) clip = (GAITS[move.gait] ?? GAITS.run)[way];
    else if (move.turn) clip = move.turn > 0 ? "Turn_Left_Loop" : "Turn_Right_Loop";
    this.play(drawn, clip, strideRate(drawn.clips.get(clip), drawn.model, speed));
  }

  // Plays a clip on someone: an ability's. Null lets it go.
  act(drawn, name, loop = false, speed = 1) {
    const clip = name && drawn.clips?.get(name);
    const now = performance.now();
    drawn.acting = clip ? { name, loop, speed, at: now, until: loop ? Infinity : now + (clip.duration * 1000) / speed } : null;
  }

  // Fades to a clip, or sets the playing one's speed.
  play(drawn, name, rate = 1, once = false, from = 0) {
    if (!drawn.clips.has(name)) return;
    const shown = drawn.legsOnly ? halfOf(drawn.clips, name, "lower") : name;
    const clip = drawn.clips.get(shown);
    drawn.mixer.clipAction(clip).timeScale = rate;
    if (drawn.playing === shown) return;
    const previous = drawn.playing && drawn.mixer.existingAction(drawn.clips.get(drawn.playing));
    drawn.playing = shown;
    const action = drawn.mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.time = from;
    action.play();
    if (previous) action.crossFadeFrom(previous, drawn.acting ? SWING_FADE_S : FADE_S, false);
  }
}
