import "../errors/install.js";
import "../report/button.js";
import "./creatures.css";
import * as THREE from "three";
import { ROLES, characterClips, loadAnimations, roleClips } from "./animations.js";
import { SKELETONS, characterMesh, disposeCharacter, skeletonOf } from "./characterMesh.js";
import { BODY_LOOKS, appearance, randomLook, resolveRecipe } from "./recipe.js";
import { WEAPONS } from "./weapons.js";

// The creatures page: each body the client builds, grouped by skeleton, playing the clip for each
// of a creature's roles (animations.js's ROLES) in a tile of its own. One canvas over the page draws
// every tile on screen, each from its own scene.

// Each body as shown, with something to hold. Each gets a new look from its recipe on "new looks".
const GEAR = { goblin: { weapon: "dagger" }, troll: { weapon: "maul" } };
const MODELS = [
  { name: "human", recipe: () => ({ ...appearance(randomLook()), weapon: "sword", offhand: "shield" }) },
  ...Object.keys(BODY_LOOKS).map((body) => ({ name: body, recipe: () => ({ body, ...GEAR[body] }) })),
];
const LOOPS = new Set(["idle", "walk", "run"]);
const HOLD_S = 1; // how long a clip that doesn't loop holds its last frame before playing again

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x6f8c4e });

const tiles = [];
let baked = null;
let paused = false;

// A scene for one tile: lit as the animation lab is, on a patch of ground.
function stage(size) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc0de);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
  sun.position.set(-0.45, 1.15, 0.85);
  scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.CircleGeometry(size * 1.4, 32).rotateX(-Math.PI / 2), groundMaterial));
  return scene;
}

// Builds every model's tiles, each with its own copy of the model playing one clip.
function build() {
  for (const tile of tiles) {
    disposeCharacter(tile.mesh);
    tile.scene.children.find((c) => c.geometry?.type === "CircleGeometry")?.geometry.dispose();
  }
  tiles.length = 0;
  document.querySelectorAll(".creatures section").forEach((el) => el.remove());
  for (const [skeleton, bodies] of Object.entries(SKELETONS)) {
    const section = document.createElement("section");
    section.append(Object.assign(document.createElement("h2"), { textContent: `${skeleton} skeleton` }));
    for (const model of MODELS.filter((m) => bodies.includes(resolveRecipe(m.recipe()).body))) {
      const look = resolveRecipe(model.recipe());
      const clipFor = roleClips(look, skeletonOf(look.body));
      const grid = Object.assign(document.createElement("div"), { className: "creature-tiles" });
      section.append(Object.assign(document.createElement("h3"), { textContent: model.name }), grid);
      // Each copy of a look has the same bones, so its clips serve every tile.
      let clips = null;
      for (const role of ROLES.filter((r) => clipFor[r])) {
        const el = Object.assign(document.createElement("div"), { className: "creature-tile" });
        el.append(Object.assign(document.createElement("span"), { textContent: role }), Object.assign(document.createElement("span"), { className: "clip", textContent: clipFor[role] }));
        grid.append(el);
        const t = tile(el, look, role, clipFor[role], clips);
        clips = t.clips;
        tiles.push(t);
      }
    }
    $("creatures").append(section);
  }
  // Every weapon's attacks, on one look, so each can be checked against its group's clips.
  const section = document.createElement("section");
  section.append(Object.assign(document.createElement("h2"), { textContent: "attacks by weapon" }));
  const base = resolveRecipe({ body: "goblin" });
  for (const weapon of WEAPONS) {
    const look = { ...base, weapon, offhand: "none" };
    const clipFor = roleClips(look, "humanoid");
    const grid = Object.assign(document.createElement("div"), { className: "creature-tiles" });
    section.append(Object.assign(document.createElement("h3"), { textContent: weapon }), grid);
    let clips = null;
    for (const role of ["attack", "bigAttack", "shoot"].filter((r) => clipFor[r])) {
      const el = Object.assign(document.createElement("div"), { className: "creature-tile" });
      el.append(Object.assign(document.createElement("span"), { textContent: role }), Object.assign(document.createElement("span"), { className: "clip", textContent: clipFor[role] }));
      grid.append(el);
      const t = tile(el, look, role, clipFor[role], clips);
      clips = t.clips;
      tiles.push(t);
    }
  }
  $("creatures").append(section);
}

function tile(el, look, role, name, clips) {
  const mesh = characterMesh(look);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const size = Math.max(box.max.y, box.max.z - box.min.z);
  const scene = stage(size);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const middle = new THREE.Vector3(0, box.max.y * 0.45, (box.min.z + box.max.z) / 2);
  camera.position.copy(middle).add(new THREE.Vector3(1.25, 0.45, 1).normalize().multiplyScalar(size * 2.4));
  camera.lookAt(middle);
  const mixer = new THREE.AnimationMixer(mesh);
  clips ??= characterClips(mesh, baked);
  const clip = clips.get(name);
  const action = mixer.clipAction(clip);
  if (!LOOPS.has(role)) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  action.play();
  return { el, mesh, scene, camera, mixer, action, clip, clips, role, waited: 0 };
}

function draw(dt) {
  const { innerWidth: w, innerHeight: h } = window;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
  // A scene's background changes the clear color, so it's set back for the page between tiles.
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const t of tiles) {
    if (!paused) {
      t.mixer.update(dt);
      if (!LOOPS.has(t.role) && t.action.time >= t.clip.duration && (t.waited += dt) > HOLD_S) {
        t.action.reset().play();
        t.waited = 0;
      }
    }
    const r = t.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    renderer.setViewport(r.left, h - r.bottom, r.width, r.height);
    renderer.setScissor(r.left, h - r.bottom, r.width, r.height);
    t.camera.aspect = r.width / r.height;
    t.camera.updateProjectionMatrix();
    renderer.render(t.scene, t.camera);
  }
}

$("reroll").addEventListener("click", build);
loadAnimations().then((data) => {
  baked = data;
  build();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => draw(clock.getDelta()));
});

// For scripted screenshots: holds every tile at `fraction` of the way through its clip.
window.creatures = {
  tiles,
  at(fraction) {
    paused = true;
    for (const t of tiles) {
      t.action.reset().play();
      t.action.time = fraction * t.clip.duration;
      t.mixer.update(0);
    }
  },
  play() {
    paused = false;
  },
};
