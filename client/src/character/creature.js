import "../errors/install.js";
import "./creature.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ROLES, characterClips, loadAnimations, roleClips } from "./animations.js";
import { ARMOR_SLOTS, ARMOR_STYLES, ARMOR_TYPES } from "./armor.js";
import { SKELETONS, characterMesh, disposeCharacter, skeletonOf } from "./characterMesh.js";
import { FRAMES } from "./frames.js";
import { BEARD, BODY_LOOKS, DEFAULT_LOOK, EARS, FACE, FLESH, GAIT, HAIR, HANDS, LOWER, LOWER_ARMS, HORNS, JEWELRY, MOUTH, MUZZLE, NOSE, TAIL, TUSKS, UNARMED, WINGS, resolveRecipe } from "./recipe.js";
import { HELD, OFFHANDS, WEAPON_STYLES, WEAPONS } from "./weapons.js";

// The creature page: one creature at a time, playing the clip for each of its roles
// (animations.js's ROLES) in turn, beside a control for each of its look's settings. Picking a
// body or a loadout makes a new look from its recipe; every other control changes the look as it
// stands.

const LOOPS = new Set(["idle", "walk", "run", "fly"]);
const LOOP_S = 3; // how long a looping clip plays before the next role
const HOLD_S = 0.8; // how long a clip that doesn't loop holds its last frame

// The look's number settings, each 0 to 1 but height.
const NUMBERS = ["height", "build", "limbs", "shoulders", "waist", "hips", "jaw", "arms", "legs", "head", "bust", "rear"];
const CHOICES = { ears: EARS, nose: NOSE, tusks: TUSKS, muzzle: MUZZLE, horns: HORNS, hair: HAIR, beard: BEARD, mouth: MOUTH, tail: TAIL, wings: WINGS, flesh: FLESH, gait: GAIT, unarmed: UNARMED, lower: LOWER, hands: HANDS, lowerArms: LOWER_ARMS };
const LISTS = { jewelry: JEWELRY, face: FACE };

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
const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f8c4e }));
scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;

// Fire for a breath: a cone out of the mouth bone along the snout, shown while the clip says the
// breath comes out (its userData.breath), flickering.
const cone = (radius, color, opacity) =>
  new THREE.Mesh(
    new THREE.ConeGeometry(radius, 1, 12, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
const flame = new THREE.Group();
flame.add(cone(0.45, 0xe03a10, 0.55), cone(0.22, 0xffc040, 0.8));
flame.visible = false;

let baked = null;
let seed = 1;
let body = "goblin";
let loadout = "random";
let look = null;
let mesh = null;
let mixer = null;
let clips = null;
let roles = {};
let order = [];
let playing = { at: 0, action: null, clip: null, time: 0 };
let fixed = "cycle"; // a role to hold on, or "cycle"
let paused = false;

function seeded(n) {
  let s = n >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// The body's loadouts, by their place in its list.
const loadoutsOf = (name) => BODY_LOOKS[name]?.loadouts ?? [];
const describe = (l) => [l.weapon && `${l.weaponStyle ?? "fine"} ${l.weapon}`, l.offhand && `${l.offhandStyle ?? "fine"} ${l.offhand}`, ...Object.entries(l.armor ?? {}).map(([slot, a]) => `${a.style ?? "fine"} ${a.type} ${slot}`)].filter(Boolean).join(", ") || "nothing";

// A new look from the body's recipe, the same seed giving the same face under each loadout.
function roll() {
  const own = { body };
  // A single outfit uses one draw, as picking among several does, so the rest of the look holds.
  if (loadout === "none") own.loadouts = [{}];
  else if (loadout !== "random") own.loadouts = [loadoutsOf(body)[loadout]];
  look = resolveRecipe(own, seeded(seed));
}

// Builds the mesh for the look as it stands, and its clips, and starts the roles again.
function rebuild({ frame = false } = {}) {
  const was = order[playing.at];
  if (mesh) {
    scene.remove(mesh);
    disposeCharacter(mesh);
  }
  mesh = characterMesh(look);
  scene.add(mesh);
  const mouth = mesh.skeleton.getBoneByName("mouth");
  if (mouth) {
    mouth.add(flame);
    flame.scale.setScalar(look.height / 14);
  }
  mixer = new THREE.AnimationMixer(mesh);
  clips = characterClips(mesh, baked);
  roles = roleClips(look, mesh.userData.skeleton);
  order = ROLES.filter((r) => roles[r] && clips.has(roles[r]));
  if (frame) frameCamera();
  playing.at = fixed !== "cycle" && order.includes(fixed) ? order.indexOf(fixed) : Math.max(0, order.indexOf(was));
  fillRoles();
}

function frameCamera() {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const size = Math.max(box.max.y, 0.65 * (box.max.z - box.min.z));
  ground.scale.setScalar(size * 2);
  const middle = new THREE.Vector3(0, box.max.y * 0.55, (box.min.z + box.max.z) / 2);
  camera.position.copy(middle).add(new THREE.Vector3(1.25, 0.45, 1).normalize().multiplyScalar(size * 3.4));
  orbit.target.copy(middle);
  orbit.update();
}

function play(at) {
  mixer.stopAllAction();
  playing = { at, time: 0, clip: clips.get(roles[order[at]]) };
  playing.action = mixer.clipAction(playing.clip);
  if (!LOOPS.has(order[at])) {
    playing.action.setLoop(THREE.LoopOnce, 1);
    playing.action.clampWhenFinished = true;
  }
  playing.action.play();
  $("now").textContent = `${order[at]}: ${roles[order[at]]}`;
  document.querySelectorAll("#roles button").forEach((b) => b.classList.toggle("on", b.dataset.role === order[at]));
}

// How long the role plays before the next.
const lasts = (role, clip) => (LOOPS.has(role) ? Math.max(LOOP_S, clip.duration) : clip.duration + HOLD_S);

function step(dt) {
  if (!mixer) return;
  const breath = playing.clip?.userData.breath;
  const time = playing.action?.time ?? 0;
  flame.visible = Boolean(breath && flame.parent && time >= breath[0] && time <= breath[1]);
  if (flame.visible) {
    // Grows out to full length, the head of it pointing the way the head turns.
    const grow = Math.min(1, (time - breath[0]) / 0.25) * Math.min(1, (breath[1] - time) / 0.15 + 0.3);
    const base = mesh.userData.look.height / 14;
    flame.scale.set(base * (1 + 0.15 * Math.sin(time * 40)), base * (1 + 0.15 * Math.cos(time * 33)), base * 9 * grow);
  }
  if (paused) return;
  mixer.update(dt);
  playing.time += dt;
  const role = order[playing.at];
  if (playing.time < lasts(role, playing.clip)) return;
  if (fixed === "cycle") play((playing.at + 1) % order.length);
  else if (!LOOPS.has(role)) play(playing.at);
}

function fillRoles() {
  const box = $("roles");
  box.replaceChildren(
    ...[["cycle", "every role"], ...order.map((r) => [r, r])].map(([role, label]) => {
      const button = el("button", { type: "button", textContent: label });
      button.dataset.role = role;
      button.classList.toggle("held", role === fixed);
      button.addEventListener("click", () => {
        fixed = role;
        box.querySelectorAll("button").forEach((b) => b.classList.toggle("held", b.dataset.role === fixed));
        play(role === "cycle" ? playing.at : order.indexOf(role));
      });
      return button;
    }),
  );
  play(playing.at);
}

// A labeled control.
const row = (label, input) => el("label", { className: "row" }, el("span", { textContent: label }), input);

function select(options, value, change) {
  const input = el("select");
  for (const option of options) {
    const [v, text] = Array.isArray(option) ? option : [option, option];
    input.append(el("option", { value: v, textContent: text, selected: String(v) === String(value) }));
  }
  input.addEventListener("change", () => change(input.value));
  return input;
}

function slider(key) {
  const [min, max, step] = key === "height" ? [1, 20, 0.1] : [0, 1, 0.05];
  const input = el("input", { type: "range", min, max, step, value: look[key] });
  const shown = el("output", { textContent: (+look[key]).toFixed(2) });
  input.addEventListener("input", () => {
    look[key] = +input.value;
    shown.textContent = (+input.value).toFixed(2);
    rebuild({ frame: key === "height" });
  });
  return el("span", { className: "slider" }, input, shown);
}

function group(title, ...rows) {
  return el("fieldset", {}, el("legend", { textContent: title }), ...rows);
}

// Every control, filled from the look; the ones the body's skeleton doesn't take are left out.
function fillControls() {
  const frame = FRAMES[skeletonOf(body)];
  const takes = (key) => !frame || frame.settings.includes(key);
  const humanoid = !frame;
  const change = (fn) => (value) => {
    fn(value);
    rebuild();
    fillControls();
  };
  const loadouts = loadoutsOf(body);
  const groups = [
    group(
      "creature",
      row("body", select(Object.values(SKELETONS).flat(), body, (v) => {
        body = v;
        loadout = "random";
        roll();
        rebuild({ frame: true });
        fillControls();
      })),
      loadouts.length || humanoid ? row("loadout", select([["random", "picked by weight"], ["none", "nothing"], ...loadouts.map((l, i) => [i, `${i + 1}: ${describe(l)}`])], loadout, (v) => {
        loadout = v === "random" || v === "none" ? v : +v;
        roll();
        rebuild();
        fillControls();
      })) : "",
    ),
    group("shape", ...NUMBERS.filter(takes).map((key) => row(key, slider(key)))),
  ];
  if (humanoid) {
    groups.push(
      group("features", ...Object.entries(CHOICES).map(([key, options]) => row(key, select(options, look[key], change((v) => (look[key] = v)))))),
      group(
        "extras",
        ...Object.entries(LISTS).flatMap(([key, options]) =>
          options.map((option) => {
            const box = el("input", { type: "checkbox", checked: look[key].includes(option) });
            box.addEventListener("change", change(() => (look[key] = box.checked ? [...look[key], option] : look[key].filter((o) => o !== option))));
            return row(option, box);
          }),
        ),
      ),
      group(
        "held",
        row("weapon", select(WEAPONS, look.weapon, change((v) => {
          look.weapon = v;
          if (HELD[v]?.twoHanded) look.offhand = "none";
        }))),
        row("weapon style", select(WEAPON_STYLES, look.weaponStyle, change((v) => (look.weaponStyle = v)))),
        row("off hand", select(HELD[look.weapon]?.twoHanded ? ["none"] : OFFHANDS, look.offhand, change((v) => (look.offhand = v)))),
        row("off-hand style", select(WEAPON_STYLES, look.offhandStyle, change((v) => (look.offhandStyle = v)))),
        row("sheathed", (() => {
          const box = el("input", { type: "checkbox", checked: look.sheathed });
          box.addEventListener("change", change(() => (look.sheathed = box.checked)));
          return box;
        })()),
      ),
      group(
        "armor",
        ...ARMOR_SLOTS.map((slot) => {
          const piece = look.armor[slot];
          const type = select(["none", ...ARMOR_TYPES], piece?.type ?? "none", change((v) => {
            if (v === "none") delete look.armor[slot];
            // A new type takes its own colors, from the recipe's defaults.
            else look.armor[slot] = { ...resolveRecipe({ armor: { [slot]: { type: v } } }).armor[slot], style: piece?.style ?? "fine" };
          }));
          const style = select(ARMOR_STYLES, piece?.style ?? "fine", change((v) => look.armor[slot] && (look.armor[slot].style = v)));
          style.disabled = !piece;
          const colors = (piece?.colors ?? []).map((color, i) => {
            const input = el("input", { type: "color", value: color });
            input.addEventListener("change", change(() => (look.armor[slot].colors[i] = input.value)));
            return input;
          });
          return row(slot, el("span", { className: "piece" }, type, style, ...colors));
        }),
      ),
    );
  }
  const colorKeys = frame ? frame.colors : Object.keys(DEFAULT_LOOK.colors);
  groups.push(
    group(
      "colors",
      ...colorKeys.map((key) => {
        const input = el("input", { type: "color", value: look.colors[key] });
        input.addEventListener("input", () => {
          look.colors[key] = input.value;
          rebuild();
        });
        return row(key, input);
      }),
    ),
  );
  $("controls").replaceChildren(...groups);
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

$("reroll").addEventListener("click", () => {
  seed = Math.floor(Math.random() * 2 ** 31);
  roll();
  rebuild();
  fillControls();
});
$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "play" : "pause";
});

loadAnimations().then((data) => {
  baked = data;
  roll();
  rebuild({ frame: true });
  fillControls();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => draw(Math.min(clock.getDelta(), 0.1)));
});

// For scripted screenshots: shows a body with a loadout, holding one role `fraction` of the way in.
window.creature = {
  show({ body: b = body, loadout: l = "random", seed: s = seed, role, fraction = 0.5, colors } = {}) {
    [body, loadout, seed] = [b, l, s];
    roll();
    Object.assign(look.colors, colors);
    rebuild({ frame: true });
    fillControls();
    if (role) {
      fixed = role;
      fillRoles();
      play(order.indexOf(role));
      paused = true;
      playing.action.time = fraction * playing.clip.duration;
      mixer.update(0);
    }
  },
  // Looks from [x, y, z] about the creature's middle, as a fraction of its size.
  view(from) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const size = Math.max(box.max.y, 0.65 * (box.max.z - box.min.z));
    camera.position.copy(orbit.target).add(new THREE.Vector3(...from).multiplyScalar(size));
    orbit.update();
  },
  get look() {
    return look;
  },
};
