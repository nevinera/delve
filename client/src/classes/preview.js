import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AbilityStage, clipNameFor } from "../abilities/stage.js";
import { MELEE_FT, hitOn, hitText, moveAt, schoolColors } from "../abilities/timeline.js";
import { characterClips, loadAnimations, roleClips } from "../character/animations.js";
import { characterMesh, disposeCharacter, skeletonOf } from "../character/characterMesh.js";
import { randomLook, resolveRecipe } from "../character/recipe.js";
import { UpperBody, canSplit, halfOf } from "../character/upperBody.js";
import { attackGroup } from "../character/weapons.js";

// Trying an ability as it's being made: a character of the class using it on a goblin in an empty
// field, with its animations, visuals and sounds, and what it does floating over who it lands on.
// None of this decides what an ability does in the game: that's the game server's.

const RANGED = new Set(["bow", "firearm", "thrown"]); // attack groups that shoot
const SEEDED = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const FLOAT_S = 1.1; // how long text floats over a unit
const FADE_S = 0.15;
const SWING_FADE_S = 0.08; // into an ability's clip, so a quick swing isn't mostly a fade

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// What a class holds to use an ability: `picked` if there's one, or else its starting gear, unless
// the ability wants something else in its `requires`.
export function gearFor(made, ability, picked = "") {
  const weapons = made.weapons ?? [];
  const offhands = made.offhands ?? [];
  if (picked) return { weapon: picked, offhand: attackGroup(picked) === "oneHanded" ? (offhands[0] ?? "none") : "none" };
  const wants = ability?.requires?.find((need) => need.wielding)?.wielding;
  const ofGroup = (group) => weapons.find((w) => attackGroup(w) === group);
  if (wants === "twoHanded") return { weapon: ofGroup("twoHanded") ?? "none", offhand: "none" };
  if (wants === "oneHanded") return { weapon: ofGroup("oneHanded") ?? "none", offhand: offhands[0] ?? "none" };
  if (wants === "shield") return { weapon: ofGroup("oneHanded") ?? "none", offhand: "shield" };
  if (wants === "dual") return { weapon: ofGroup("oneHanded") ?? "none", offhand: offhands.find((o) => !["shield", "orb"].includes(o)) ?? "none" };
  const weapon = made.startingGear?.weapon ?? weapons[0] ?? "none";
  const offhand = made.startingGear?.offhand ?? offhands[0] ?? "none";
  return { weapon, offhand: ["twoHanded", "bow", "firearm"].includes(attackGroup(weapon)) ? "none" : offhand };
}

// The preview's characters always have their weapons out.
const standingReady = (roles) => ({ ...roles, idle: roles.ready ?? roles.idle });

export class AbilityPreview {
  constructor(root) {
    this.root = root;
    this.canvas = el("canvas", { className: "preview-stage" });
    this.overlay = el("div", { className: "preview-overlay" });
    this.bar = el("div", { className: "preview-bar", hidden: true }, el("div", { className: "preview-bar-fill" }), el("span", { className: "preview-bar-label" }));
    this.heading = el("div", { className: "preview-name" });
    const stage = el("div", { className: "preview-view" }, this.canvas, this.overlay, this.bar, this.heading);

    this.playButton = el("button", { type: "button", textContent: "use it (space)" });
    this.playButton.addEventListener("click", () => this.play());
    this.loopBox = el("input", { type: "checkbox" });
    this.muteBox = el("input", { type: "checkbox" });
    this.runBox = el("input", { type: "checkbox" });
    this.runBox.addEventListener("change", () => (this.stop(), this.runLegs()));
    this.weaponSelect = el("select", { title: "what the character holds" });
    this.weaponSelect.addEventListener("change", () => (this.stop(), this.setClass(this.made, this.ability)));
    this.speed = 1;
    this.speedSelect = el("select", {}, ...[["1", "full speed"], ["0.5", "half speed"], ["0.25", "quarter speed"]].map(([value, textContent]) => el("option", { value, textContent })));
    this.speedSelect.addEventListener("change", () => (this.speed = Number(this.speedSelect.value)));
    this.distanceInput = el("input", { type: "range", min: 0, max: 60, step: 1, value: 30 });
    this.distanceText = el("span");
    this.distanceInput.addEventListener("input", () => this.setDistance(Number(this.distanceInput.value)));
    this.say = el("span", { className: "preview-note" });
    root.replaceChildren(
      stage,
      el(
        "div",
        { className: "preview-controls" },
        this.playButton,
        el("label", {}, this.loopBox, " loop"),
        el("label", {}, this.muteBox, " mute"),
        el("label", {}, this.runBox, " run"),
        this.weaponSelect,
        this.speedSelect,
        el("label", { className: "preview-distance" }, "target ", this.distanceInput, this.distanceText),
        this.say,
      ),
    );

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc0de);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
    sun.position.set(-0.45, 1.15, 0.85);
    this.scene.add(sun);
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(200, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6d8a4e }));
    this.scene.add(this.ground);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 900);
    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.enableDamping = true;
    // Once it's been moved by hand, the camera stays where it's been put.
    this.orbit.addEventListener("start", () => (this.frameAll = false));
    // Where a ground-targeted ability lands, which clicking the ground moves.
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x90e0ff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.reticle.position.y = 0.12;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.spot = new THREE.Vector3(30, 0, 0);
    this.ray = new THREE.Raycaster();
    let downAt = null;
    this.canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
    this.canvas.addEventListener("pointerup", (e) => {
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) this.clickGround(e);
    });
    this.canvas.addEventListener("pointermove", (e) => this.aimReticle(e));

    this.distance = 30;
    this.stage = new AbilityStage(this.scene, { audio: () => (this.muteBox.checked ? null : this.audioContext()) });
    this.floats = [];
    this.run = null; // what's playing, from the stage
    this.makeUnit("dummy", resolveRecipe({ body: "goblin" }, SEEDED(7)));
    this.frameAll = true;
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.keydown = (e) => {
      if (e.code !== "Space" || !this.ability || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      this.play();
    };
    window.addEventListener("keydown", this.keydown);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // Makes a unit, in place of the one it replaces: "caster" or "dummy".
  makeUnit(which, look) {
    const old = this[which];
    if (old) {
      this.scene.remove(old.mesh);
      disposeCharacter(old.mesh);
    }
    const mesh = characterMesh(look);
    this.scene.add(mesh);
    mesh.geometry.computeBoundingBox();
    const unit = { mesh, look, mixer: new THREE.AnimationMixer(mesh), clips: null, roles: standingReady(roleClips(look, skeletonOf(look.body))), playing: null, height: mesh.geometry.boundingBox.max.y };
    unit.clip = (role, loop, speed) => this.clip(unit, role ?? "idle", role === null || loop, speed);
    this[which] = unit;
    loadAnimations().then((baked) => {
      if (this[which] !== unit) return;
      unit.clips = characterClips(mesh, baked);
      if (which === "caster") this.runLegs();
      else this.clip(unit, "idle", true);
    });
    this.placeUnits();
    return unit;
  }

  // Plays a role's clip on a unit, or a spell's holding clip for "channel".
  clip(unit, role, loop = false, speed = 1) {
    if (!unit.clips) return;
    const name = clipNameFor(role, unit.roles, unit.clips);
    const clip = unit.clips.get(name);
    if (!clip) return;
    if (unit === this.caster && this.runBox.checked && canSplit(unit.mesh)) {
      unit.upper ??= new UpperBody(unit.mixer, unit.clips);
      if (role === "idle") unit.upper.clear();
      else unit.upper.show({}, name, { once: !loop, speed });
      unit.back = loop ? null : clip.duration / speed;
      unit.playedFor = 0;
      return;
    }
    const action = unit.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = speed;
    const previous = unit.playing;
    action.play();
    if (previous && previous !== action) previous.crossFadeTo(action, role === "idle" ? FADE_S : SWING_FADE_S, false);
    unit.playing = action;
    unit.back = loop ? null : clip.duration / speed;
    unit.playedFor = 0;
  }

  // Has the caster's legs run, with what it uses played on its arms, or go back to standing.
  runLegs() {
    const unit = this.caster;
    if (!unit?.clips) return;
    unit.upper?.clear();
    if (!this.runBox.checked || !canSplit(unit.mesh)) return this.clip(unit, "idle", true);
    const action = unit.mixer.clipAction(unit.clips.get(halfOf(unit.clips, "Run_Fwd_Loop", "lower")));
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    if (unit.playing && unit.playing !== action) unit.playing.crossFadeTo(action, FADE_S, false);
    unit.playing = action;
    unit.back = null;
  }

  // Sets who's using it: a character in the class's colors, holding what the ability needs, or what
  // the picker says.
  setClass(made, ability) {
    this.made = made;
    const held = this.weaponSelect.value;
    const weapons = made.weapons ?? [];
    this.weaponSelect.replaceChildren(el("option", { value: "", textContent: "weapon it needs" }), ...weapons.map((value) => el("option", { value, textContent: value })));
    this.weaponSelect.value = weapons.includes(held) ? held : "";
    const { weapon, offhand } = gearFor(made, ability, this.weaponSelect.value);
    const armor = made.armor?.[0]?.type ?? "";
    const key = JSON.stringify([made.id, weapon, offhand, armor, made.colors]);
    if (key === this.classKey) return;
    this.classKey = key;
    const base = randomLook(SEEDED(11));
    const colors = { ...base.colors, ...(made.colors?.major ? { primary: made.colors.major } : {}), ...(made.colors?.minor ? { secondary: made.colors.minor } : {}) };
    this.ranged = RANGED.has(attackGroup(weapon));
    this.makeUnit("caster", { ...base, weapon, offhand, sheathed: false, colors });
  }

  setAbility(ability, statuses = []) {
    this.statuses = statuses;
    this.ability = ability;
    this.heading.textContent = ability?.name ?? "";
    this.playButton.disabled = !ability;
    if (ability) this.fitRange(ability);
    this.reticle.visible = ability?.target === "ground";
    this.showReticle();
    this.stop();
  }

  // Keeps the slider to what the ability can reach, and melee abilities in melee.
  fitRange(ability) {
    const melee = ability.range === "melee";
    const reach = typeof ability.range === "number" ? ability.range : 60;
    const max = Math.max(5, melee ? 15 : reach);
    this.distanceInput.max = max;
    this.distanceInput.min = ability.minRange ?? 0;
    const hadAbility = this.fittedFor === ability.id;
    this.fittedFor = ability.id;
    let distance = this.distance;
    if (!hadAbility) distance = melee ? MELEE_FT : Math.min(max, 30);
    this.setDistance(Math.max(ability.minRange ?? 0, Math.min(max, distance)));
  }

  setDistance(feet) {
    this.distance = feet;
    this.distanceInput.value = feet;
    this.distanceText.textContent = ` ${feet} ft`;
    this.spot.set(feet, 0, 0);
    this.placeUnits();
    this.showReticle();
    if (this.frameAll) this.frameCamera();
  }

  placeUnits() {
    if (this.caster) {
      this.caster.mesh.position.set(0, 0, 0);
      this.caster.mesh.rotation.y = Math.PI / 2;
    }
    if (this.dummy) {
      this.dummy.mesh.position.set(this.distance, 0, 0);
      this.dummy.mesh.rotation.y = -Math.PI / 2;
    }
  }

  // Looks from the side and a little above, far enough off to see both units across the view.
  frameCamera() {
    const across = Math.max(16, this.distance + 12);
    const tall = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const away = Math.max(across / (tall * this.camera.aspect), 14 / tall);
    const look = new THREE.Vector3(0, 0.3, 1).normalize().multiplyScalar(away);
    this.orbit.target.set(this.distance / 2, 3, 0);
    this.camera.position.copy(this.orbit.target).add(look);
    this.orbit.update();
  }

  groundPoint(e) {
    const box = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), this.camera);
    return this.ray.intersectObject(this.ground)[0]?.point ?? null;
  }

  clickGround(e) {
    if (this.ability?.target !== "ground") return;
    const at = this.groundPoint(e);
    if (at) this.spot.copy(at).setY(0);
    this.showReticle();
  }

  // The reticle follows the pointer, and stays where it was last clicked once it leaves.
  aimReticle(e) {
    if (this.ability?.target !== "ground") return;
    const at = this.groundPoint(e);
    if (at && !e.buttons) {
      this.reticle.position.set(at.x, 0.12, at.z);
    }
  }

  // How wide an ability's area is, for its reticle: its first area effect's, or 5 ft.
  showReticle() {
    if (!this.ability) return;
    const radius = (this.ability.effects ?? []).find((effect) => effect.radius)?.radius ?? 5;
    this.reticle.scale.setScalar(radius);
    this.reticle.position.set(this.spot.x, 0.12, this.spot.z);
  }

  stop() {
    this.stage.clear();
    this.run = null;
    this.bar.hidden = true;
    this.placeUnits();
    if (this.caster) this.clip(this.caster, "idle", true);
    if (this.dummy) this.clip(this.dummy, "idle", true);
    for (const float of this.floats) float.node.remove();
    this.floats = [];
  }

  play() {
    if (!this.ability) return;
    this.stop();
    const distance = this.ability.target === "ground" ? this.spot.length() : this.distance;
    const on = { hit: (event) => this.land(event), bar: (event) => this.showBar(event), shake: (strength) => this.stage.shake(strength) };
    this.run = this.stage.play(this.ability, { caster: this.caster, target: this.dummy, spot: this.ability.target === "ground" ? this.spot : null, ranged: this.ranged, distance, on });
    this.say.textContent = this.problem();
    if (this.audio?.state === "suspended") this.audio.resume();
  }

  // What the ability lacks for this to show much.
  problem() {
    const { events } = this.run.line;
    if (!(this.ability.effects ?? []).length && !events.some((e) => e.kind === "visual" || e.kind === "sound")) return "It doesn't do anything yet: add an effect, a visual or a sound.";
    return "";
  }

  showBar(event) {
    if (!event) return;
    this.bar.hidden = false;
    this.bar.querySelector(".preview-bar-label").textContent = event.label ?? "";
    this.run.bar = { from: event.at, until: event.until, draining: event.draining };
  }

  // One of the ability's effects landing: the unit reacts, and what it did floats over it.
  land({ effect, at }) {
    const on = hitOn(effect, this.ability) === "caster" ? this.caster : this.dummy;
    if (effect.type === "damage" && on === this.dummy) this.clip(this.dummy, "hit");
    if (effect.type === "move") this.run.moves.push({ effect, at });
    const text = hitText(effect, this.statuses);
    if (text) this.floatText(on, text, effect.type);
    if (effect.type === "status") {
      const status = this.statuses.find((s) => s.id === effect.status);
      if (status?.aura?.effect) this.stage.aura(on, status.aura, schoolColors(this.ability));
    }
  }

  floatText(unit, text, type) {
    const node = el("div", { className: `preview-float preview-float-${type}`, textContent: text });
    this.overlay.append(node);
    this.floats.push({ node, unit, at: this.run.t, shift: this.floats.length % 3 });
  }

  audioContext() {
    this.audio ??= new AudioContext();
    if (this.audio.state === "suspended") this.audio.resume();
    return this.audio;
  }

  // Moves units as the moves that have landed say.
  applyMoves() {
    const { t, moves } = this.run;
    let [casterAlong, casterUp, targetAlong, targetUp] = [0, 0, this.distance, 0];
    for (const { effect, at } of moves) {
      const moved = moveAt(effect, t - at, this.distance);
      if (moved.caster) [casterAlong, casterUp] = moved.caster;
      if (moved.target) {
        targetAlong = this.distance + moved.target[0];
        targetUp = moved.target[1];
      }
    }
    this.caster.mesh.position.set(casterAlong, casterUp, 0);
    this.dummy.mesh.position.set(targetAlong, targetUp, 0);
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.speed;
    this.last = now;
    const running = this.run;
    this.stage.frame(dt);
    if (running) {
      if (running.moves.length) this.applyMoves();
      this.drawBar();
      if (!this.stage.runs.includes(running)) {
        const again = this.loopBox.checked;
        this.stop();
        if (again) this.play();
      }
    }
    for (const unit of [this.caster, this.dummy]) {
      if (!unit) continue;
      unit.mixer.update(dt);
      if (unit.back !== null && unit.back !== undefined) {
        unit.playedFor += dt;
        if (unit.playedFor >= unit.back) {
          unit.back = null;
          this.clip(unit, "idle", true);
        }
      }
    }
    this.stage.place();
    this.orbit.update();
    this.drawFloats();
    const shaken = this.stage.shakeOffset();
    this.camera.position.add(shaken);
    this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(shaken);
    requestAnimationFrame((t) => this.frame(t));
  }

  drawBar() {
    const bar = this.run.bar;
    if (!bar) return;
    const u = Math.min(1, (this.run.t - bar.from) / Math.max(0.001, bar.until - bar.from));
    this.bar.firstChild.style.width = `${(bar.draining ? 1 - u : u) * 100}%`;
    if (u >= 1) {
      this.bar.hidden = true;
      this.run.bar = null;
    }
  }

  drawFloats() {
    const box = this.canvas.getBoundingClientRect();
    const t = this.run?.t ?? Infinity;
    this.floats = this.floats.filter((float) => {
      const u = (t - float.at) / FLOAT_S;
      if (u >= 1) {
        float.node.remove();
        return false;
      }
      const at = float.unit.mesh.position.clone().add(new THREE.Vector3(0, float.unit.height + 1 + u * 2, 0)).project(this.camera);
      const half = float.node.offsetWidth / 2; // long text stays in view
      float.node.style.left = `${Math.max(half, Math.min(box.width - half, ((at.x + 1) / 2) * box.width))}px`;
      float.node.style.top = `${((1 - at.y) / 2) * box.height + float.shift * 16}px`;
      float.node.style.opacity = String(1 - u * u);
      return true;
    });
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.frameAll) this.frameCamera();
  }
}
