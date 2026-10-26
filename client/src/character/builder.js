import "./builder.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { characterMesh, disposeCharacter } from "./characterMesh.js";
import { BEARD, DEFAULT_LOOK, HAIR, JEWELRY, WEAPONS, resolveRecipe, saveLook, savedLook } from "./recipe.js";

// The character builder page: one character on a patch of ground, with a control for each setting
// of its look, and the look as recipe JSON to copy. Walk mode uses the look made here. "Test pose" swings the limbs, to check every
// part follows its bones.

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
function rebuild() {
  if (character) {
    scene.remove(character);
    disposeCharacter(character);
  }
  character = characterMesh(look);
  scene.add(character);
  $("recipe").textContent = JSON.stringify(look, null, 2);
  saveLook(look);
}

// Swings the arms and legs and turns the head, or puts them back.
function pose(t) {
  const bones = Object.fromEntries(character.skeleton.bones.map((b) => [b.name, b]));
  const on = $("testPose").checked;
  const swing = on ? Math.sin(t * 3) : 0;
  bones.upperarm_l.rotation.x = 0.6 * swing;
  bones.upperarm_r.rotation.x = -0.6 * swing;
  bones.lowerarm_l.rotation.x = on ? -0.5 - 0.3 * swing : 0;
  bones.lowerarm_r.rotation.x = on ? -0.5 + 0.3 * swing : 0;
  bones.thigh_l.rotation.x = -0.5 * swing;
  bones.thigh_r.rotation.x = 0.5 * swing;
  bones.calf_l.rotation.x = on ? 0.4 + 0.3 * swing : 0;
  bones.calf_r.rotation.x = on ? 0.4 - 0.3 * swing : 0;
  bones.head.rotation.y = 0.4 * swing;
  bones.spine_02.rotation.y = 0.1 * swing;
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
  ]) {
    const select = document.createElement("select");
    for (const option of options) select.add(new Option(option, option, false, option === look[key]));
    select.addEventListener("change", () => {
      look[key] = select.value;
      rebuild();
    });
    row(key, select);
  }
  for (const item of JEWELRY) {
    const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: look.jewelry.includes(item) });
    box.addEventListener("change", () => {
      look.jewelry = JEWELRY.filter((j) => (j === item ? box.checked : look.jewelry.includes(j)));
      rebuild();
    });
    row(item, box);
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

$("reset").addEventListener("click", () => {
  look = resolveRecipe();
  $("controls").replaceChildren();
  buildControls();
  rebuild();
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
renderer.setAnimationLoop((ms) => {
  pose(ms / 1000);
  renderer.render(scene, camera);
});
