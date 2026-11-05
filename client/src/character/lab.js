import "../errors/install.js";
import "./builder.css";
import "./lab.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { characterClips, loadAnimations } from "./animations.js";
import { characterMesh, disposeCharacter } from "./characterMesh.js";
import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_TYPES } from "./armor.js";
import { BODY_LOOKS, appearance, randomLook, resolveRecipe } from "./recipe.js";
import { HELD, OFFHANDS, WEAPONS } from "./weapons.js";

// The animation lab, for working on animations: any clip on any of your characters, holding any
// weapons and wearing any armor, played at any speed, paused, scrubbed or stepped a frame at a
// time, from any side.

const FRAME_S = 1 / 30;
// Where the camera looks from for each view, and what it looks at.
const VIEWS = {
  front: [[0, 4, 16], [0, 3, 0]],
  quarter: [[9, 5, 13], [0, 3, 0]],
  side: [[16, 3.8, 0], [0, 3, 0]],
  back: [[0, 4, -16], [0, 3, 0]],
  top: [[0.5, 19, 1.5], [0, 2.5, 0]],
};

const $ = (id) => document.getElementById(id);
const page = $("lab").dataset;
const characters = JSON.parse(page.characters);

const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc0de);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
sun.position.set(-0.45, 1.15, 0.85);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8c4e }));
scene.add(ground);
// Lines a foot apart on the ground, to judge where feet and blades land.
const grid = new THREE.GridHelper(16, 16, 0x4d6a30, 0x5d7a3e);
grid.position.y = 0.005;
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);

let look = resolveRecipe(characters[0]?.look ?? {});
const gear = { weapon: "greataxe", offhand: "none", armor: "none" };
let character = null;
let baked = null;
let mixer = null;
let clips = new Map();
let action = null;
const state = { clip: "TwoHand_Sweep", speed: 1, paused: false, loop: true };

function dressed() {
  const armor = {};
  if (ARMOR_TYPES.includes(gear.armor)) {
    for (const slot of ARMOR_SLOTS) armor[slot] = { type: gear.armor, colors: [...ARMOR_COLORS[gear.armor]] };
  }
  const offhand = HELD[gear.weapon]?.twoHanded ? "none" : gear.offhand;
  return { ...look, weapon: gear.weapon, offhand, sheathed: false, armor };
}

function rebuild() {
  const time = action?.time ?? 0;
  if (character) {
    scene.remove(character);
    disposeCharacter(character);
    mixer.stopAllAction();
  }
  character = characterMesh(dressed());
  scene.add(character);
  mixer = new THREE.AnimationMixer(character);
  clips = baked ? characterClips(character, baked) : new Map();
  action = null;
  listClips();
  start(time);
}

// Plays the chosen clip from `time`, held there if paused.
function start(time = 0) {
  const clip = clips.get(state.clip);
  if (!clip) return;
  mixer.stopAllAction();
  action = mixer.clipAction(clip);
  action.reset().setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  action.play();
  action.time = Math.min(time, clip.duration);
  $("time").max = clip.duration;
  mixer.update(0);
  showTime();
}

// Holds the clip at `time`.
function seek(time) {
  if (!action) return;
  const { duration } = action.getClip();
  action.enabled = true;
  action.paused = false;
  action.time = ((time % duration) + duration) % duration;
  mixer.update(0);
  showTime();
}

function showTime() {
  if (!action) return;
  $("time").value = action.time;
  $("timeValue").textContent = `${action.time.toFixed(2)} / ${action.getClip().duration.toFixed(2)}s`;
}

function setPaused(paused) {
  state.paused = paused;
  $("play").textContent = paused ? "play" : "pause";
}

function view(name) {
  const [position, target] = VIEWS[name];
  camera.position.set(...position);
  controls.target.set(...target);
  controls.update();
}

// A labeled row in the panel.
function row(label, ...controls) {
  const el = document.createElement("label");
  el.className = "builder-row";
  el.append(Object.assign(document.createElement("span"), { textContent: label }), ...controls);
  $("controls").append(el);
  return el;
}

function select(label, options, value, change) {
  const el = document.createElement("select");
  for (const [key, text] of options) el.append(new Option(text, key, false, key === value));
  el.addEventListener("change", () => change(el.value));
  row(label, el);
  return el;
}

function buildControls() {
  const characterOptions = characters.map((c, i) => [String(i), c.name]);
  const creatures = Object.keys(BODY_LOOKS).map((body) => [body, `a ${body}`]);
  select("character", [...characterOptions, ["random", "a random look"], ...creatures], "0", (value) => {
    if (value === "random") look = resolveRecipe(appearance(randomLook()));
    else if (BODY_LOOKS[value]) look = resolveRecipe({ body: value });
    else look = resolveRecipe(characters[Number(value)].look);
    rebuild();
  });
  select("weapon", WEAPONS.map((w) => [w, w]), gear.weapon, (value) => {
    gear.weapon = value;
    rebuild();
  });
  select("off hand", OFFHANDS.map((w) => [w, w]), gear.offhand, (value) => {
    gear.offhand = value;
    rebuild();
  });
  select("armor", ["none", ...ARMOR_TYPES].map((a) => [a, a]), gear.armor, (value) => {
    gear.armor = value;
    rebuild();
  });
}

// Lists the character's clips, keeping the chosen one where it has it, or idling where not.
function listClips() {
  const clip = $("clip");
  const names = [...clips.keys()].sort();
  if (!names.length) return;
  if (!clips.has(state.clip)) state.clip = "Idle_Loop";
  clip.replaceChildren(...names.map((name) => new Option(name, name, false, name === state.clip)));
}

function buildPlayer() {
  const clip = $("clip");
  clip.addEventListener("change", () => {
    state.clip = clip.value;
    start(0);
  });
  $("play").addEventListener("click", () => setPaused(!state.paused));
  $("back").addEventListener("click", () => {
    setPaused(true);
    seek(action.time - FRAME_S);
  });
  $("forward").addEventListener("click", () => {
    setPaused(true);
    seek(action.time + FRAME_S);
  });
  $("restart").addEventListener("click", () => start(0));
  $("time").addEventListener("input", () => {
    setPaused(true);
    seek(Number($("time").value));
  });
  $("speed").addEventListener("input", () => {
    state.speed = Number($("speed").value);
    $("speedValue").textContent = `${state.speed.toFixed(2)}×`;
  });
  $("loop").addEventListener("change", () => {
    state.loop = $("loop").checked;
    start(action?.time ?? 0);
  });
  for (const name of Object.keys(VIEWS)) {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: name });
    button.addEventListener("click", () => view(name));
    $("views").append(button);
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input[type=text], textarea, select")) return;
    if (e.key === " ") {
      e.preventDefault();
      setPaused(!state.paused);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setPaused(true);
      seek(action.time + (e.key === "ArrowLeft" ? -FRAME_S : FRAME_S));
    }
  });
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

view("quarter");
buildControls();
buildPlayer();
rebuild();
loadAnimations().then((data) => {
  baked = data;
  rebuild();
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (action && !state.paused) {
    mixer.update(delta * state.speed);
    showTime();
  }
  renderer.render(scene, camera);
});

// For scripted screenshots: hold a clip at a time, and look from a place at a point.
window.lab = {
  at(name, time) {
    state.clip = name;
    $("clip").value = name;
    setPaused(true);
    start(time);
  },
  look(position, target) {
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  },
  wear(next) {
    Object.assign(gear, next);
    rebuild();
  },
};
