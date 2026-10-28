import "./builder.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { characterClips, loadAnimations } from "./animations.js";
import { characterMesh, disposeCharacter } from "./characterMesh.js";
import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_SWATCHES, ARMOR_TYPES } from "./armor.js";
import { BEARD, CLOTH, EYES, FACE, HAIR, HAIR_COLORS, JEWELRY, METAL, PAINT, SKIN, appearance, randomLook, resolveRecipe } from "./recipe.js";

// The character builder page: one character on a patch of ground, with a control for each part of
// its appearance and its name. It makes a new character or changes one of yours. A set of armor
// and a pair of weapons to see it in, and a few animations to see it move, aren't saved: what a
// character wears and holds comes from each world.

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

// The colors a player picks, each from a palette of swatches, with their labels and when they show
// on the character. Steel and wood stay as they are.
const PICKED_COLORS = {
  skin: ["skin", SKIN, () => true],
  hair: ["hair color", HAIR_COLORS, () => look.hair !== "bald" || look.beard !== "none" || look.face.includes("sideburns")],
  eyes: ["eyes", EYES, () => true],
  primary: ["shirt", CLOTH, () => true],
  secondary: ["trousers", CLOTH, () => true],
  metal: ["metal", METAL, () => look.jewelry.length || look.face.includes("glasses") || wield().weapon !== "none"],
  paint: ["warpaint", PAINT, () => look.face.includes("warpaint")],
};

// Attacks, each a run of clips played in turn.
const SWORD = [["Sword_Attack"], ["Sword_Regular_A", "Sword_Regular_A_Rec"], ["Sword_Regular_B", "Sword_Regular_B_Rec"], ["Sword_Regular_C"]];
const TWO_HANDED = [["TwoHand_Chop"], ["TwoHand_Sweep"]];
const SPELL = [["Spell_Simple_Enter", "Spell_Simple_Shoot", "Spell_Simple_Exit"]];

// What the character can hold, and the attacks that go with it.
const WIELDS = {
  unarmed: { weapon: "none", offhand: "none", attacks: [["Punch_Jab"], ["Punch_Cross"], ["Melee_Hook", "Melee_Hook_Rec"]] },
  "sword and shield": { weapon: "sword", offhand: "shield", attacks: SWORD },
  "mace and shield": { weapon: "mace", offhand: "shield", attacks: SWORD },
  "two swords": { weapon: "sword", offhand: "sword", attacks: SWORD },
  "two daggers": { weapon: "dagger", offhand: "dagger", attacks: SWORD },
  "axe and mace": { weapon: "axe", offhand: "mace", attacks: SWORD },
  greatsword: { weapon: "greatsword", offhand: "none", attacks: TWO_HANDED },
  "great axe": { weapon: "greataxe", offhand: "none", attacks: TWO_HANDED },
  maul: { weapon: "maul", offhand: "none", attacks: TWO_HANDED },
  polearm: { weapon: "polearm", offhand: "none", attacks: TWO_HANDED },
  staff: { weapon: "staff", offhand: "none", attacks: SPELL },
  "wand and orb": { weapon: "wand", offhand: "orb", attacks: SPELL },
  bow: { weapon: "bow", offhand: "none", attacks: [["Bow_Shoot"]] },
};

// The animation buttons, each a run of clips. A clip can be { clip, from, speed, for }: started
// `from` seconds in, played at `speed`, and moved on from after `for` seconds; a looping one with
// `air` holds until the character lands. A run that ends on a loop keeps it until another button
// is pressed. The character idles between them.
const MOVES = {
  run: () => ["Run_Fwd_Loop"],
  dance: () => ["Dance_Loop"],
  attack: () => wield().attacks[Math.floor(Math.random() * wield().attacks.length)],
  // As the walker jumps (editor/walker.js): up at takeoff, falling back under gravity.
  jump: () => [{ clip: "Jump_Start", from: 0.1, speed: 1.5, for: 0.35, takeoff: true }, { clip: "Jump_Loop", air: true }, { clip: "Jump_Land", speed: 1.6, for: 0.55 }],
  sit: () => ["Sit_Ground_Enter", { clip: "Sit_Ground_Idle_Loop", for: 3 }, "Sit_Ground_Exit"],
};
const JUMP_FT = 16; // upward speed at takeoff, per second
const GRAVITY = 48;

const $ = (id) => document.getElementById(id);
const page = $("builder").dataset;
const saved = JSON.parse(page.character);
// A new character starts as someone random.
let look = saved.id ? resolveRecipe(saved.look) : resolveRecipe(appearance(randomLook()));
const gear = { armor: "none", colors: null, helmet: true, wield: "unarmed" };
const wield = () => WIELDS[gear.wield];

// The look with the gear it's trying on.
function dressed() {
  const armor = {};
  if (ARMOR_TYPES.includes(gear.armor)) {
    for (const slot of ARMOR_SLOTS) {
      if (slot !== "head" || gear.helmet) armor[slot] = { type: gear.armor, colors: [...gear.colors] };
    }
  }
  const { weapon, offhand } = wield();
  return { ...look, weapon, offhand, sheathed: false, armor };
}

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
// Controls that only show when they'd change something: [row, when]. Each set of swatches marks
// the one picked: [row, mark].
let showing = [];
let marking = [];
const showRows = () => {
  showing.forEach(([row, when]) => (row.hidden = !when()));
  marking.forEach(([, mark]) => mark());
};

// The move playing: its button, its run of clips, which one is on, and for how long.
let move = null;
let current = null;
// How high the character is off the ground, and how fast it's rising.
let height = 0;
let rising = 0;
function rebuild() {
  if (character) {
    scene.remove(character);
    disposeCharacter(character);
    mixer.stopAllAction();
  }
  character = characterMesh(dressed());
  character.position.y = height;
  scene.add(character);
  mixer = new THREE.AnimationMixer(character);
  mixer.addEventListener("finished", next);
  clips = baked ? characterClips(character, baked) : new Map();
  current = null;
  showRows();
  if (move) step(move.index, 0);
  else play(IDLE, 0);
}

// Plays a clip, fading from the one playing, `from` seconds in at `speed`.
function play(name, fade = FADE_S, { from = 0, speed = 1 } = {}) {
  const clip = clips.get(name);
  if (!clip) return;
  const previous = current && mixer.existingAction(clips.get(current));
  current = name;
  const action = mixer.clipAction(clip);
  action.reset().setLoop(/_Loop$/.test(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  action.timeScale = speed;
  action.time = from;
  action.play();
  if (previous && previous !== action && fade) previous.crossFadeTo(action, fade, false);
  else if (previous && previous !== action) previous.stop();
}

// Starts a move from its first clip, or stops it if it's playing; null goes back to idling.
function start(name) {
  move = name && move?.name !== name ? { name, run: MOVES[name](), index: 0, held: 0 } : null;
  for (const button of document.querySelectorAll("#moves button")) button.classList.toggle("playing", button.dataset.move === move?.name);
  if (move?.run[0].takeoff && height === 0) rising = JUMP_FT;
  if (move) step(0);
  else play(IDLE);
}

function step(index, fade = FADE_S) {
  const item = move.run[index];
  move.index = index;
  move.held = 0;
  play(item.clip ?? item, fade, item);
}

// The next clip of the move, or idle after its last.
function next() {
  if (!move) return;
  if (move.index + 1 < move.run.length) step(move.index + 1);
  else start(null);
}

function buildMoves() {
  const panel = $("moves");
  for (const name of Object.keys(MOVES)) {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: name });
    button.dataset.move = name;
    button.addEventListener("click", () => start(name));
    panel.append(button);
  }
}

// Helpers that add rows of controls to a panel, each rebuilding the character when changed.
function controlsIn(panel) {
  const row = (label, input, after = null) => {
    const el = document.createElement("label");
    el.className = "builder-row";
    el.append(Object.assign(document.createElement("span"), { textContent: label }), input);
    if (after) el.append(after);
    panel.append(el);
    return el;
  };
  return {
    row,
    heading: (text) => panel.append(Object.assign(document.createElement("h2"), { textContent: text })),
    choose: (label, options, value, set) => {
      const select = document.createElement("select");
      for (const option of options) select.add(new Option(option, option, false, option === value));
      select.addEventListener("change", () => {
        set(select.value);
        rebuild();
      });
      return row(label, select);
    },
    check: (label, checked, set) => {
      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked });
      box.addEventListener("change", () => {
        set(box.checked);
        rebuild();
      });
      return row(label, box);
    },
    // A label over a palette's swatches, ten to a row.
    swatches: (label, palette, get, set) => {
      const el = Object.assign(document.createElement("div"), { className: "builder-colors" });
      const grid = Object.assign(document.createElement("div"), { className: "builder-swatches" });
      for (const color of palette) {
        const swatch = Object.assign(document.createElement("button"), { type: "button", title: color });
        swatch.style.background = color;
        swatch.addEventListener("click", () => {
          set(color);
          rebuild();
        });
        grid.append(swatch);
      }
      marking.push([el, () => [...grid.children].forEach((swatch) => swatch.classList.toggle("picked", swatch.title === get()))]);
      el.append(Object.assign(document.createElement("span"), { textContent: label }), grid);
      panel.append(el);
      return el;
    },
  };
}

// The controls for the character's appearance.
function buildControls() {
  const { row, heading, choose, check, swatches } = controlsIn($("controls"));
  // Rows that went with the controls these replace are dropped.
  showing = showing.filter(([el]) => el.isConnected);
  marking = marking.filter(([el]) => el.isConnected);

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

  heading("Face and hair");
  choose("hair", HAIR, look.hair, (value) => (look.hair = value));
  choose("beard", BEARD, look.beard, (value) => (look.beard = value));
  // A checkbox for each item of jewelry and each face marking.
  for (const [key, items] of [
    ["jewelry", JEWELRY],
    ["face", FACE],
  ]) {
    for (const item of items) check(item, look[key].includes(item), (on) => (look[key] = items.filter((j) => (j === item ? on : look[key].includes(j)))));
  }

  heading("Colors");
  for (const [key, [label, palette, when]] of Object.entries(PICKED_COLORS)) {
    showing.push([swatches(label, palette, () => look.colors[key], (color) => (look.colors[key] = color)), when]);
  }
}

// The armor and weapons to try on, which stay as they are when the look changes. Armor starts in
// its type's own colors.
function buildTryOn() {
  const { heading, choose, check, swatches } = controlsIn($("tryOn"));
  heading("Try on (not saved)");
  const worn = () => gear.armor !== "none";
  choose("armor", ["none", ...ARMOR_TYPES], gear.armor, (value) => {
    gear.armor = value;
    gear.colors = worn() ? [...ARMOR_COLORS[value]] : null;
  });
  showing.push([check("helmet", gear.helmet, (on) => (gear.helmet = on)), worn]);
  ["armor main", "armor trim"].forEach((label, i) => showing.push([swatches(label, ARMOR_SWATCHES[i], () => gear.colors?.[i], (color) => (gear.colors[i] = color)), worn]));
  choose("weapons", Object.keys(WIELDS), gear.wield, (value) => (gear.wield = value));
}

// Shows a look, setting every control to match.
function show(next) {
  look = next;
  $("controls").replaceChildren();
  buildControls();
  rebuild();
}

// Reset goes back to the saved character, or for a new one, the default look.
$("reset").addEventListener("click", () => show(resolveRecipe(saved.look)));
$("random").addEventListener("click", () => show(resolveRecipe(appearance(randomLook()))));

// Saves the name and appearance: a new character is made, and the page becomes its edit page.
async function save() {
  const note = $("saveNote");
  note.textContent = "saving…";
  $("save").disabled = true;
  try {
    const response = await fetch(page.saveUrl, {
      method: page.saveMethod,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector("meta[name=csrf-token]")?.content },
      body: JSON.stringify({ character: { name: $("name").value, look: appearance(look) } }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      note.textContent = body.errors?.join(". ") ?? `Couldn't save: the server said ${response.status}.`;
      return;
    }
    Object.assign(saved, { id: body.id, name: body.name, look: appearance(look) });
    $("name").value = body.name;
    document.querySelector("#builder h1").textContent = body.name;
    document.title = `${body.name} - Delve`;
    if (page.saveMethod === "POST") {
      page.saveUrl = body.edit_url.replace(/\/edit$/, "");
      page.saveMethod = "PATCH";
      $("save").textContent = "Save changes";
      history.replaceState(null, "", body.edit_url);
    }
    note.textContent = "saved";
  } catch (err) {
    note.textContent = `Couldn't save: ${err.message}`;
  } finally {
    $("save").disabled = false;
  }
}
$("save").addEventListener("click", save);
$("name").addEventListener("keydown", (e) => e.key === "Enter" && save());

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

buildControls();
buildTryOn();
buildMoves();
rebuild();
loadAnimations().then((data) => {
  baked = data;
  clips = characterClips(character, baked);
  play(IDLE, 0);
});
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  mixer.update(delta);
  if (height > 0 || rising > 0) {
    rising -= GRAVITY * delta;
    height = Math.max(0, height + rising * delta);
    if (height === 0) rising = 0;
    character.position.y = height;
  }
  // A clip held for a while moves on when its time is up, and one held in the air when it lands.
  const item = move?.run[move.index];
  if (item?.for && (move.held += delta) >= item.for) next();
  else if (item?.air && height === 0) next();
  renderer.render(scene, camera);
});
