import * as THREE from "three";
import { characterClips, loadAnimations, strideRate } from "../character/animations.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { TURN_RATE } from "../character/posed.js";
import { resolveRecipe } from "../character/recipe.js";
import { BACK_FT, GAITS, GRAVITY, JUMP_FT, RUN_FT, SPRINT, SWIM_FT, WALK_FT } from "./walker.js";

// The other characters near you, as the game server reports them. Each carries on moving as it
// last said it was, between messages, and eases toward where each message says it is. Each has its
// name over its head, the same size on screen however far off, out to NAME_FT.

const CATCH_UP = 8; // how fast a drawn character closes the gap to where it should be, per second
const SNAP_FT = 40; // further off than this across the ground, it jumps there
const FADE_S = 0.2;
const NAME_FT = 300; // names show out to this far from the camera
const NAME_ABOVE_FT = 0.6; // how far over the head
const NAME_SCREEN = 0.035; // a name's height, as a share of the view's height
const NAME_PX = 48; // the name's drawn text size

// How fast a `move` goes, in feet per second.
export function speedOf(move) {
  if (!move.forward && !move.strafe) return 0;
  if (move.swim) return SWIM_FT;
  const base = move.gait === "walk" ? WALK_FT : move.forward < 0 ? BACK_FT : RUN_FT;
  return base * (move.gait === "sprint" ? SPRINT : 1);
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
    const model = characterMesh({ ...look, sheathed: true });
    const drawn = {
      id: character.id,
      name: character.name,
      model,
      nameplate: nameplate(character.name),
      height: look.height,
      mixer: new THREE.AnimationMixer(model),
      clips: null,
      playing: null,
      vy: 0,
      shown: new THREE.Vector3(...character.at),
    };
    this.update(drawn, character);
    loadAnimations().then((baked) => {
      if (this.characters.get(drawn.id) === drawn) drawn.clips = characterClips(model, baked);
    });
    this.characters.set(drawn.id, drawn);
    this.view.scene.add(model, drawn.nameplate);
  }

  moved(message) {
    const drawn = this.characters.get(message.id);
    if (drawn) this.update(drawn, message);
  }

  update(drawn, { at, yaw, move }) {
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
    disposeCharacter(drawn.model);
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
        drawn.vy -= GRAVITY * dt;
        drawn.at.y += drawn.vy * dt;
        if (drawn.at.y <= ground) [drawn.at.y, drawn.vy] = [ground, 0];
      }
      drawn.airborne = ground !== null && ground !== undefined && drawn.at.y > ground + 0.5;
      drawn.shown.lerp(drawn.at, Math.min(1, CATCH_UP * dt));
      drawn.model.position.set(drawn.shown.x - origin[0], drawn.shown.y, drawn.shown.z - origin[1]);
      drawn.model.rotation.y = drawn.yaw;
      drawn.nameplate.position.copy(drawn.model.position).y += drawn.height + NAME_ABOVE_FT;
      drawn.nameplate.visible = drawn.nameplate.position.distanceTo(this.view.camera.position) < NAME_FT;
      this.animate(drawn, dt);
    }
  }

  animate(drawn, dt) {
    drawn.mixer.update(dt);
    if (!drawn.clips) return;
    const { move } = drawn;
    const speed = speedOf(move);
    const way = move.forward < 0 ? "back" : move.forward > 0 || !move.strafe ? "ahead" : move.strafe > 0 ? "left" : "right";
    let clip = "Idle_Loop";
    if (move.swim) clip = speed ? "Swim_Fwd_Loop" : "Swim_Idle_Loop";
    else if (drawn.airborne) clip = "Jump_Loop";
    else if (speed) clip = (GAITS[move.gait] ?? GAITS.run)[way];
    else if (move.turn) clip = move.turn > 0 ? "Turn_Left_Loop" : "Turn_Right_Loop";
    this.play(drawn, clip, strideRate(drawn.clips.get(clip), drawn.model, speed));
  }

  // Fades to a clip, or sets the playing one's speed.
  play(drawn, name, rate = 1) {
    const clip = drawn.clips.get(name);
    if (!clip) return;
    drawn.mixer.clipAction(clip).timeScale = rate;
    if (drawn.playing === name) return;
    const previous = drawn.playing && drawn.mixer.existingAction(drawn.clips.get(drawn.playing));
    drawn.playing = name;
    const action = drawn.mixer.clipAction(clip);
    action.reset();
    action.play();
    if (previous) action.crossFadeFrom(previous, FADE_S, false);
  }
}
