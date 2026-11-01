import "./monsterLab.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ROLES, characterClips, loadAnimations, roleClips } from "./animations.js";
import { SKELETONS, characterMesh, disposeCharacter } from "./characterMesh.js";
import { SHIPPED_BODIES } from "./bodies.js";
import { BODY_LOOKS, resolveRecipe } from "./recipe.js";

// The monster lab, for looking over creature bodies: every body the client builds, listed by
// skeleton; several looks of the picked one side by side, each from its own seed and, in turn,
// each of its loadouts; all playing every role each has in turn, or one of its roles (each look the clip it has for it) or any one
// of its clips, at any speed, paused, scrubbed or stepped a frame at a time, from any side.

const FRAME_S = 1 / 30;
const LOOP_ROLES = new Set(["idle", "walk", "run", "fly"]);
const CYCLE_S = 3; // how long each role plays, going through every one
const GAP = 1.35; // how far apart looks stand, as a share of the biggest's size
// Where the camera looks from, as a share of the row's size, about its middle.
const VIEWS = { quarter: [0.55, 0.3, 0.75], front: [0, 0.25, 1], side: [1, 0.2, 0], back: [0, 0.25, -1], top: [0.05, 1.2, 0.2] };

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc0de);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
sun.position.set(-0.45, 1.15, 0.85);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8c4e }));
scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;

// Fire for a breath, as the creature page draws it: a cone out of the mouth bone, shown while the
// clip says the breath comes out (its userData.breath).
function flame() {
  const cone = (radius, color, opacity) =>
    new THREE.Mesh(
      new THREE.ConeGeometry(radius, 1, 12, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
  const group = new THREE.Group();
  group.add(cone(0.45, 0xe03a10, 0.55), cone(0.22, 0xffc040, 0.8));
  group.visible = false;
  return group;
}

const bodies = Object.values(SKELETONS).flat();
const state = { body: location.hash.slice(1) || "goblin", seed: 1, count: 4, loadouts: "each", coloration: "each", pick: "all", speed: 1, paused: false, loop: true, cycle: false };
if (!bodies.includes(state.body)) state.body = "goblin";
let baked = null;
let looks = []; // { look, mesh, mixer, clips, roles, action, clip, flame }
let cycled = 0; // how long the role's played, going through every one
let turn = 0; // which of its roles each look plays, playing everything in turn

function seeded(n) {
  let s = n >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const loadoutsOf = (body) => BODY_LOOKS[body]?.loadouts ?? [];
const colorationsOf = (body) => SHIPPED_BODIES[body]?.colorations ?? [];

// The coloration picker: each in turn, picked by weight, or one of the body's.
function fillColorations() {
  const names = colorationsOf(state.body).map((c) => c.name);
  if (!["each", "random", ...names].includes(state.coloration)) state.coloration = "each";
  $("coloration").replaceChildren(el("option", { value: "each", textContent: "one each, in turn" }), el("option", { value: "random", textContent: "picked by weight" }), ...names.map((n) => el("option", { value: n, textContent: n })));
  $("coloration").value = state.coloration;
  $("coloration").disabled = !names.length;
}
const describe = (l) => [l.weapon, l.offhand, ...Object.values(l.armor ?? {}).map((a) => a.type)].filter((v) => v && v !== "none").join(", ") || "nothing";

// The k'th look of the body: its own seed, and its loadout as the loadouts setting says.
function lookFor(k) {
  const own = { body: state.body };
  const loadouts = loadoutsOf(state.body);
  if (state.loadouts === "none") own.loadouts = [{}];
  else if (state.loadouts === "each" && loadouts.length) own.loadouts = [loadouts[k % loadouts.length]];
  const colorations = colorationsOf(state.body);
  if (state.coloration === "each" && colorations.length) own.coloration = colorations[k % colorations.length].name;
  else if (state.coloration !== "random") own.coloration = state.coloration;
  return resolveRecipe(own, seeded(state.seed * 7919 + k));
}

function build() {
  turn = 0;
  fillColorations();
  for (const l of looks) {
    scene.remove(l.mesh);
    disposeCharacter(l.mesh);
  }
  looks = [];
  for (let k = 0; k < state.count; k++) {
    const look = lookFor(k);
    const mesh = characterMesh(look);
    const mixer = new THREE.AnimationMixer(mesh);
    const fire = flame();
    const mouth = mesh.skeleton.getBoneByName("mouth");
    if (mouth) {
      mouth.add(fire);
      fire.scale.setScalar(look.height / 14);
    }
    looks.push({ look, mesh, mixer, clips: characterClips(mesh, baked), roles: roleClips(look, mesh.userData.skeleton), flame: fire, action: null, clip: null });
  }
  // Side by side, along x, each as far from the next as the biggest is big.
  const sizes = looks.map(({ mesh }) => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    return Math.max(box.max.y, box.max.x - box.min.x, 0.9 * (box.max.z - box.min.z));
  });
  const size = Math.max(...sizes);
  looks.forEach(({ mesh }, k) => {
    mesh.position.x = (k - (looks.length - 1) / 2) * size * GAP;
    scene.add(mesh);
  });
  ground.scale.setScalar(size * GAP * (looks.length + 2));
  fillClips();
  fillLooks();
  start();
  return size;
}

// The roles the looks have, then every clip the first has.
function fillClips() {
  const [first] = looks;
  const roles = ROLES.filter((r) => looks.some((l) => l.roles[r] && l.clips.has(l.roles[r])));
  const names = [...first.clips.keys()].sort();
  const select = $("clip");
  select.replaceChildren(
    el("option", { value: "all", textContent: "everything, in turn" }),
    el("optgroup", { label: "roles" }, ...roles.map((r) => el("option", { value: `role:${r}`, textContent: `${r}: ${first.roles[r] ?? "-"}` }))),
    el("optgroup", { label: "every clip" }, ...names.map((n) => el("option", { value: `clip:${n}`, textContent: n }))),
  );
  if (![...select.options].some((o) => o.value === state.pick)) state.pick = `role:${roles[0]}`;
  select.value = state.pick;
}

function fillLooks() {
  $("looks").replaceChildren(...looks.map(({ look }, k) => el("div", { className: "monster-look", textContent: `${k + 1}: ${[look.coloration, describe(look)].filter(Boolean).join("; ")}` })));
}

// The roles a look has a clip for, in ROLES' order.
const rolesOf = (l) => ROLES.filter((r) => l.roles[r] && l.clips.has(l.roles[r]));

// The role each look plays for the pick: playing everything, its turn'th, or idle once it's
// played them all, while looks with more go on.
function roleOf(l) {
  if (state.pick === "all") return rolesOf(l)[turn] ?? "idle";
  return state.pick.startsWith("role:") ? state.pick.slice(5) : null;
}

// The clip each look plays for the pick, or null.
function clipOf(l) {
  const role = roleOf(l);
  return l.clips.get(role ? l.roles[role] : state.pick.slice(5)) ?? null;
}

function loops(l) {
  if (state.pick === "all") return LOOP_ROLES.has(roleOf(l));
  return state.loop && (!state.pick.startsWith("role:") || LOOP_ROLES.has(state.pick.slice(5)) || !state.cycle);
}

// Starts every look's clip for the pick, `fraction` of the way through.
function start(fraction = 0) {
  cycled = 0;
  for (const l of looks) {
    l.mixer.stopAllAction();
    l.clip = clipOf(l);
    l.action = null;
    if (!l.clip) continue;
    l.action = l.mixer.clipAction(l.clip);
    l.action.reset().setLoop(loops(l) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    l.action.clampWhenFinished = true;
    l.action.play();
    l.action.time = fraction * l.clip.duration;
    l.mixer.update(0);
  }
  const shown = looks.find((l) => l.clip);
  if (state.pick === "all") {
    $("now").textContent = `${state.body}: everything (${looks.map((l) => roleOf(l)).filter((r, k, all) => all.indexOf(r) === k).join(", ")})`;
    showTime();
    return;
  }
  $("now").textContent = shown ? `${state.body}: ${state.pick.replace(":", " ")}${state.pick.startsWith("role:") ? ` (${shown.clip.name})` : ""}` : `${state.body}: no ${state.pick.replace(":", " ")}`;
  showTime();
}

// Holds every look `fraction` of the way through its clip.
function seek(fraction) {
  for (const l of looks) {
    if (!l.action) continue;
    l.action.enabled = true;
    l.action.paused = false;
    l.action.time = (((fraction % 1) + 1) % 1) * l.clip.duration;
    l.mixer.update(0);
  }
  showTime();
}

const fractionNow = () => {
  const l = looks.find((x) => x.action);
  return l ? l.action.time / l.clip.duration : 0;
};

function showTime() {
  const l = looks.find((x) => x.action);
  if (!l) return;
  $("time").value = fractionNow();
  $("timeValue").textContent = `${l.action.time.toFixed(2)} / ${l.clip.duration.toFixed(2)}s`;
}

function setPaused(paused) {
  state.paused = paused;
  $("play").textContent = paused ? "play" : "pause";
}

function pickBody(body) {
  state.body = body;
  history.replaceState(null, "", `#${body}`);
  document.querySelectorAll("#bodies button").forEach((b) => b.classList.toggle("on", b.dataset.body === body));
  document.querySelector(`#bodies button[data-body="${body}"]`)?.scrollIntoView({ block: "nearest" });
  view("quarter", build());
}

let rowSize = 1;
function view(name, size = rowSize) {
  rowSize = size;
  const width = size * GAP * Math.max(1, looks.length);
  const span = Math.max(size * 1.6, width * 0.75);
  const middle = new THREE.Vector3(0, size * 0.45, 0);
  camera.position.copy(middle).add(new THREE.Vector3(...VIEWS[name]).normalize().multiplyScalar(span * 2.4));
  orbit.target.copy(middle);
  orbit.update();
}

function step(dt) {
  for (const l of looks) {
    const breath = l.clip?.userData.breath;
    const time = l.action?.time ?? 0;
    l.flame.visible = Boolean(breath && l.flame.parent && time >= breath[0] && time <= breath[1]);
    if (l.flame.visible) {
      const grow = Math.min(1, (time - breath[0]) / 0.25) * Math.min(1, (breath[1] - time) / 0.15 + 0.3);
      const base = l.look.height / 14;
      l.flame.scale.set(base * (1 + 0.15 * Math.sin(time * 40)), base * (1 + 0.15 * Math.cos(time * 33)), base * 9 * grow);
    }
  }
  if (state.paused) return;
  for (const l of looks) l.mixer.update(dt * state.speed);
  showTime();
  if (state.pick === "all") {
    // Each role plays a while, or once and a beat, then every look goes on to its next.
    cycled += dt * state.speed;
    const limit = Math.max(0, ...looks.filter((l) => l.clip).map((l) => (LOOP_ROLES.has(roleOf(l)) ? CYCLE_S : l.clip.duration + 0.8)));
    if (cycled < limit) return;
    turn = (turn + 1) % Math.max(1, ...looks.map((l) => rolesOf(l).length));
    start();
    return;
  }
  if (!state.cycle) return;
  // Going through every role: each plays a while, or once and a beat.
  cycled += dt * state.speed;
  const longest = Math.max(0, ...looks.filter((l) => l.clip).map((l) => l.clip.duration));
  const role = state.pick.startsWith("role:") ? state.pick.slice(5) : null;
  if (cycled < (role && LOOP_ROLES.has(role) ? Math.max(CYCLE_S, longest) : longest + 0.8)) return;
  const options = [...$("clip").querySelectorAll('optgroup[label="roles"] option')].map((o) => o.value);
  state.pick = options[(options.indexOf(state.pick) + 1) % options.length];
  $("clip").value = state.pick;
  start();
}

function draw(dt) {
  const { clientWidth: w, clientHeight: h } = canvas;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  step(dt);
  orbit.update();
  renderer.render(scene, camera);
}

// The body list, by skeleton.
$("bodies").replaceChildren(
  ...Object.entries(SKELETONS).map(([skeleton, names]) =>
    el(
      "section",
      {},
      el("h2", { textContent: `${skeleton} (${names.length})` }),
      ...names.map((name) => {
        const button = el("button", { type: "button", textContent: name });
        button.dataset.body = name;
        button.addEventListener("click", () => pickBody(name));
        return button;
      }),
    ),
  ),
);
for (const name of Object.keys(VIEWS)) {
  const button = el("button", { type: "button", textContent: name });
  button.addEventListener("click", () => view(name));
  $("views").append(button);
}

$("clip").addEventListener("change", () => {
  state.pick = $("clip").value;
  turn = 0;
  start();
});
$("time").addEventListener("input", () => {
  setPaused(true);
  seek(+$("time").value);
});
$("speed").addEventListener("input", () => {
  state.speed = +$("speed").value;
  $("speedValue").textContent = `${state.speed.toFixed(2)}×`;
});
$("loop").addEventListener("change", () => {
  state.loop = $("loop").checked;
  start(fractionNow());
});
$("cycle").addEventListener("change", () => {
  state.cycle = $("cycle").checked;
  start();
});
$("restart").addEventListener("click", () => start());
$("play").addEventListener("click", () => setPaused(!state.paused));
const frameStep = (by) => {
  setPaused(true);
  const l = looks.find((x) => x.action);
  if (l) seek(fractionNow() + by / l.clip.duration);
};
$("back").addEventListener("click", () => frameStep(-FRAME_S));
$("forward").addEventListener("click", () => frameStep(FRAME_S));
$("count").addEventListener("input", () => {
  state.count = +$("count").value;
  $("countValue").textContent = String(state.count);
  view("quarter", build());
});
$("loadouts").addEventListener("change", () => {
  state.loadouts = $("loadouts").value;
  build();
});
$("coloration").addEventListener("change", () => {
  state.coloration = $("coloration").value;
  build();
});
$("reroll").addEventListener("click", () => {
  state.seed = Math.floor(Math.random() * 2 ** 31);
  build();
});
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.key === " ") setPaused(!state.paused);
  else if (e.key === "ArrowLeft") frameStep(-FRAME_S);
  else if (e.key === "ArrowRight") frameStep(FRAME_S);
  else if (e.key === "ArrowUp" || e.key === "ArrowDown") pickBody(bodies[(bodies.indexOf(state.body) + (e.key === "ArrowUp" ? bodies.length - 1 : 1)) % bodies.length]);
  else return;
  e.preventDefault();
});

loadAnimations().then((data) => {
  baked = data;
  pickBody(state.body);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => draw(Math.min(clock.getDelta(), 0.1)));
});

// For scripted screenshots: shows a body, `count` looks of it, all held `fraction` of the way into
// a pick ("role:attack" or "clip:Name").
window.lab = {
  show({ body = state.body, count = state.count, seed = state.seed, pick = state.pick, fraction = 0.5, loadouts = state.loadouts } = {}) {
    Object.assign(state, { count, seed, pick, loadouts });
    $("count").value = String(count);
    $("countValue").textContent = String(count);
    pickBody(body);
    state.pick = pick;
    $("clip").value = pick;
    setPaused(true);
    start(fraction);
  },
  view,
  get looks() {
    return looks;
  },
};
