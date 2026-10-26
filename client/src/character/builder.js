import "./builder.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { characterClips, clipNames, loadAnimations } from "./animations.js";
import { characterMesh, disposeCharacter } from "./characterMesh.js";
import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_TYPES } from "./armor.js";
import { BEARD, DEFAULT_LOOK, FACE, HAIR, JEWELRY, nameLook, namedLooks, resolveRecipe, saveLook, savedLook } from "./recipe.js";
import { HELD, OFFHANDS, WEAPONS } from "./weapons.js";

// The character builder page: one character on a patch of ground, with a control for each setting
// of its look, and the look as recipe JSON to copy. Walk mode uses the look made here. A button
// for each animation clip plays it: loops until another is picked, one-shots then back to idle.
// Dragging the time slider pauses the clip there.

// Clips by what they're for, shown in this order; the rest go under "other".
const CLIP_GROUPS = [
  ["moving", /^(Idle_Loop|Walk|Jog|Sprint|Crouch|Jump|Roll|Swim|Sit_Ground)/],
  ["combat", /^(TwoHand|Bow|Sword|Punch|Melee|Shield|Idle_Shield|Spell|OverhandThrow|Hit|Death|LayToIdle)/],
  ["other", /./],
];
const IDLE = "Idle_Loop";
const FADE_S = 0.2;

const SLIDERS = [
  ["height", 4.5, 8, 0.05],
  ["build", 0, 1, 0.01],
  ["limbs", 0, 1, 0.01],
  ["shoulders", 0, 1, 0.01],
  ["waist", 0, 1, 0.01],
  ["hips", 0, 1, 0.01],
  ["jaw", 0, 1, 0.01],
  ["bust", 0, 1, 0.01],
];

const $ = (id) => document.getElementById(id);
let look = savedLook();

const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc0de);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
sun.position.set(-0.45, 1.15, 0.85);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8c4e }));
scene.add(ground);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
camera.position.set(4, 4.5, 11);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.update();

let character = null;
let baked = null;
let mixer = null;
let clips = new Map();
let playing = null;
let scrubbing = false;
function rebuild() {
  if (character) {
    scene.remove(character);
    disposeCharacter(character);
    mixer.stopAllAction();
  }
  character = characterMesh(look);
  scene.add(character);
  mixer = new THREE.AnimationMixer(character);
  mixer.addEventListener("finished", () => play(IDLE));
  clips = baked ? characterClips(character, baked) : new Map();
  if (playing) play(playing, 0);
  $("recipe").textContent = JSON.stringify(look, null, 2);
  saveLook(look);
}

// Plays a clip, fading from the one playing; null stands still in the bind pose.
function play(name, fade = FADE_S) {
  const previous = playing && clips.get(playing) && mixer.existingAction(clips.get(playing));
  playing = name;
  scrubbing = false;
  for (const button of document.querySelectorAll("#animations button")) button.classList.toggle("playing", button.dataset.clip === (name ?? ""));
  if (!name || !clips.has(name)) {
    mixer.stopAllAction();
    character.skeleton.pose();
    return;
  }
  const action = mixer.clipAction(clips.get(name));
  const loops = /Loop|Idle$/.test(name);
  action.reset().setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  action.play();
  if (previous && previous !== action && fade) previous.crossFadeTo(action, fade, false);
  else if (previous && previous !== action) previous.stop();
}

// Pauses the playing clip `fraction` of the way through, with no fading.
function scrub(fraction) {
  const clip = clips.get(playing);
  if (!clip) return;
  scrubbing = true;
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset().play();
  action.paused = true;
  action.time = fraction * clip.duration;
  mixer.update(0);
}

function buildAnimations() {
  const panel = $("animations");
  const time = Object.assign(document.createElement("input"), { type: "range", id: "clipTime", min: 0, max: 1, step: 0.001, value: 0 });
  time.addEventListener("input", () => scrub(Number(time.value)));
  const row = Object.assign(document.createElement("label"), { className: "builder-row" });
  row.append(Object.assign(document.createElement("span"), { textContent: "time" }), time);
  panel.append(row);
  const names = clipNames(baked);
  const label = (name) => name.replace(/_Loop$/, "").replaceAll("_", " ").toLowerCase();
  const button = (text, clip) => {
    const el = Object.assign(document.createElement("button"), { type: "button", textContent: text });
    el.dataset.clip = clip ?? "";
    el.addEventListener("click", () => play(clip));
    return el;
  };
  const used = new Set();
  for (const [group, pattern] of CLIP_GROUPS) {
    const mine = names.filter((n) => !used.has(n) && pattern.test(n));
    mine.forEach((n) => used.add(n));
    panel.append(Object.assign(document.createElement("h2"), { textContent: `animations: ${group}` }));
    const row = Object.assign(document.createElement("div"), { className: "builder-clips" });
    if (group === "moving") row.append(button("bind pose", null));
    row.append(...mine.map((n) => button(label(n), n)));
    panel.append(row);
  }
}

function buildControls() {
  const panel = $("controls");
  const row = (label, input, after = null) => {
    const el = document.createElement("label");
    el.className = "builder-row";
    el.append(Object.assign(document.createElement("span"), { textContent: label }), input);
    if (after) el.append(after);
    panel.append(el);
  };
  const heading = (text) => panel.append(Object.assign(document.createElement("h2"), { textContent: text }));

  heading("Body");
  for (const [key, min, max, step] of SLIDERS) {
    const input = Object.assign(document.createElement("input"), { type: "range", min, max, step, value: look[key] });
    const value = document.createElement("output");
    const show = () => (value.textContent = key === "height" ? `${Number(input.value).toFixed(2)} ft` : Number(input.value).toFixed(2));
    show();
    input.addEventListener("input", () => {
      look[key] = Number(input.value);
      show();
      rebuild();
    });
    row(key, input, value);
  }

  heading("Parts");
  for (const [key, options] of [
    ["hair", HAIR],
    ["beard", BEARD],
    ["weapon", WEAPONS],
    ["offhand", OFFHANDS],
  ]) {
    const select = document.createElement("select");
    select.id = key;
    for (const option of options) select.add(new Option(option, option, false, option === look[key]));
    select.addEventListener("change", () => {
      look[key] = select.value;
      showOffhand();
      rebuild();
    });
    row(key, select);
  }
  // Two-handed weapons leave no hand free.
  const showOffhand = () => {
    const free = !HELD[look.weapon]?.twoHanded;
    $("offhand").disabled = !free;
    if (!free) $("offhand").value = look.offhand = "none";
  };
  showOffhand();
  // A checkbox for each item of jewelry and each face marking.
  for (const [key, items] of [
    ["jewelry", JEWELRY],
    ["face", FACE],
  ]) {
    for (const item of items) {
      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: look[key].includes(item) });
      box.addEventListener("change", () => {
        look[key] = items.filter((j) => (j === item ? box.checked : look[key].includes(j)));
        rebuild();
      });
      row(item, box);
    }
  }

  // Each armor slot: its type, and its main and trim colors beside.
  heading("Armor");
  for (const slot of ARMOR_SLOTS) {
    const select = document.createElement("select");
    for (const option of ["none", ...ARMOR_TYPES]) select.add(new Option(option, option, false, option === (look.armor[slot]?.type ?? "none")));
    const pair = Object.assign(document.createElement("span"), { className: "builder-pair" });
    const colors = [0, 1].map((i) => {
      const input = Object.assign(document.createElement("input"), { type: "color" });
      input.addEventListener("input", () => {
        look.armor[slot].colors[i] = input.value;
        rebuild();
      });
      pair.append(input);
      return input;
    });
    const show = () => {
      const piece = look.armor[slot];
      colors.forEach((input, i) => {
        input.hidden = !piece;
        if (piece) input.value = piece.colors[i];
      });
    };
    select.addEventListener("change", () => {
      if (select.value === "none") delete look.armor[slot];
      else look.armor[slot] = { type: select.value, colors: [...ARMOR_COLORS[select.value]] };
      show();
      rebuild();
    });
    show();
    row(slot, select, pair);
  }

  heading("Colors");
  for (const key of Object.keys(DEFAULT_LOOK.colors)) {
    const input = Object.assign(document.createElement("input"), { type: "color", value: look.colors[key] });
    input.addEventListener("input", () => {
      look.colors[key] = input.value;
      rebuild();
    });
    row(key, input);
  }
}

// Shows a look, setting every control to match.
function show(next) {
  look = next;
  $("controls").replaceChildren();
  buildControls();
  rebuild();
}

$("reset").addEventListener("click", () => show(resolveRecipe()));

// Saved characters, by name, in this browser.
function listSaved(selected = null) {
  const names = Object.keys(namedLooks()).sort((a, b) => a.localeCompare(b));
  $("saved").replaceChildren(...(names.length ? names.map((name) => new Option(name, name, false, name === selected)) : [new Option("none saved yet", "")]));
  for (const id of ["saved", "load", "delete"]) $(id).disabled = !names.length;
}
$("save").addEventListener("click", () => {
  const name = prompt("Name this character:", $("saved").value || "")?.trim();
  if (!name) return;
  if (namedLooks()[name] && !confirm(`Replace the saved "${name}"?`)) return;
  if (!nameLook(name, look)) alert("Couldn't save in this browser.");
  listSaved(name);
});
$("load").addEventListener("click", () => {
  const saved = namedLooks()[$("saved").value];
  if (saved) show(resolveRecipe(saved));
});
$("delete").addEventListener("click", () => {
  const name = $("saved").value;
  if (name && confirm(`Delete "${name}"?`)) nameLook(name, null);
  listSaved();
});
listSaved();

// A pasted recipe, read the same way as a saved one.
$("loadPaste").addEventListener("click", () => {
  try {
    const recipe = JSON.parse($("paste").value);
    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) throw new Error("not a recipe");
    show(resolveRecipe(recipe));
    $("paste").value = "";
    $("pasteNote").textContent = "";
  } catch {
    $("pasteNote").textContent = "that isn't a recipe";
  }
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(look, null, 2));
    $("copy").textContent = "copied";
  } catch {
    $("copy").textContent = "couldn't copy";
  }
  setTimeout(() => ($("copy").textContent = "copy recipe"), 1500);
});

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

buildControls();
rebuild();
loadAnimations().then((data) => {
  baked = data;
  clips = characterClips(character, baked);
  buildAnimations();
  play(IDLE, 0);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (!scrubbing) {
    mixer.update(delta);
    const action = clips.get(playing) && mixer.existingAction(clips.get(playing));
    if (action && $("clipTime")) $("clipTime").value = (action.time % action.getClip().duration) / action.getClip().duration;
  }
  renderer.render(scene, camera);
});
