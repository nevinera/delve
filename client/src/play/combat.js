import * as THREE from "three";
import { chestOf, AbilityStage, clipNameFor } from "../abilities/stage.js";
import { roleClips } from "../character/animations.js";
import { skeletonOf } from "../character/characterMesh.js";
import { strFromU8 } from "fflate";
import { allHold } from "./conditions.js";
import { PlayLog } from "./log.js";

// Fighting on the play page: frames for you and your target, an action bar, a cast bar, what lands
// floating over who it lands on, and a log. The game server decides everything: this asks it to use
// abilities, and shows what it says happened.

const ATTACK_KEY = "`";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const FLOAT_S = 1.2;
const REFUSED_S = 2;
const PICK_PX = 60; // how far from someone's chest on screen a click still picks them
const TARGET_FT = 150; // how far Tab looks for someone to target
const RETICLE_STEP_FT = 1;
const RETICLE_FT = 300;

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// The nearest of `units` ({ x, y } on screen, in view) to a click, within reach; or null.
export function pickNearest(units, x, y, reach = PICK_PX) {
  let best = null;
  let bestGap = reach;
  for (const unit of units) {
    const gap = Math.hypot(unit.x - x, unit.y - y);
    if (gap <= bestGap) [best, bestGap] = [unit, gap];
  }
  return best;
}

// The next to Tab to: going from nearest to furthest, and back round to the first after the last.
export function nextTarget(units, current) {
  const ordered = [...units].sort((a, b) => a.gap - b.gap);
  if (!ordered.length) return null;
  const at = ordered.findIndex((u) => u.id === current);
  return ordered[(at + 1) % ordered.length];
}

// What a `hit` reads as over who it lands on, or null for nothing, and its kind for its color.
export function hitWords(hit, statuses = []) {
  if (hit.missed) return { text: "miss", kind: "miss" };
  const crit = hit.crit ? "!" : "";
  if (hit.effect === "damage") return { text: `${hit.amount}${crit}`, kind: "damage" };
  if (hit.effect === "heal") return { text: `+${hit.amount}${crit}`, kind: "heal" };
  if (hit.effect === "status") return { text: statuses.find((s) => s.id === hit.status)?.name ?? hit.status, kind: "status" };
  return null;
}

// What a character of this level knows of its class. What a specialization or talent gives isn't
// known until choosing those exists. The game server has the same rule (combat.Class.Knows).
export function knownAbilities(made, level) {
  const chosen = new Set((made.specializations ?? []).flatMap((s) => s.abilities ?? []));
  for (const tier of Object.values(made.talents ?? {})) for (const talent of tier) for (const grant of talent.grants ?? []) if (grant.ability) chosen.add(grant.ability);
  return (made.abilities ?? []).filter((a) => (a.level ?? 1) <= level && !chosen.has(a.id)).sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
}

// The resources to show: the primary one always, and the rest once something you know uses them.
export function shownResources(made, known) {
  const used = new Set();
  const look = (effect) => {
    if (effect?.resource) used.add(effect.resource);
    (effect?.effects ?? []).forEach(look);
    if (effect?.effect) look(effect.effect);
  };
  for (const ability of known) {
    (ability.cost ?? []).forEach((cost) => used.add(cost.resource));
    (ability.effects ?? []).forEach(look);
  }
  return (made.resources ?? []).filter((r, i) => i === 0 || used.has(r.key));
}

export class PlayCombat {
  // you: the welcome's character. loader: the world's files. hud: the element to build in.
  constructor({ view, others, connection, loader, you, hud }) {
    Object.assign(this, { view, others, connection, loader, you, hud });
    this.classes = new Map(); // id -> a promise of its file
    this.target = null;
    this.stage = new AbilityStage(view.scene, { audio: () => this.audioContext() });
    this.runs = new Map(); // caster id -> its run
    this.floats = [];
    this.cooldowns = new Map(); // ability id -> when it's ready, in performance.now()
    this.gcdUntil = 0;
    this.resources = {};
    this.resourceMax = {};
    this.statuses = new Map(); // unit id -> the statuses you've put on it, as stacks by id
    this.health = you.health;
    this.maxHealth = you.maxHealth;
    this.aiming = null;
    this.build();
    this.bind();
    if (you.class) this.classOf(you.class).then((made) => this.setClass(made));
  }

  classOf(id) {
    if (!this.classes.has(id)) {
      this.classes.set(id, this.loader.file(`classes/${id}.json`).then((bytes) => (bytes ? JSON.parse(strFromU8(bytes)) : null)));
    }
    return this.classes.get(id);
  }

  audioContext() {
    this.audio ??= new AudioContext();
    if (this.audio.state === "suspended") this.audio.resume();
    return this.audio;
  }

  build() {
    this.youFrame = this.frameNode();
    this.targetFrame = this.frameNode();
    this.targetFrame.root.hidden = true;
    this.bar = el("div", { className: "combat-actions" });
    this.castBar = el("div", { className: "combat-cast", hidden: true }, el("div", { className: "combat-cast-fill" }), el("span", { className: "combat-cast-label" }));
    this.say = el("div", { className: "combat-say" });
    this.log = new PlayLog((line) => this.connection.command(line));
    this.floatLayer = el("div", { className: "combat-floats" });
    this.hud.replaceChildren(el("div", { className: "combat-frames" }, this.youFrame.root, this.targetFrame.root), this.floatLayer, this.say, this.castBar, this.bar, this.log.root);
    this.youFrame.name.textContent = `${this.you.name}${this.you.level ? ` (${this.you.level})` : ""}`;
    this.drawFrame(this.youFrame, this.health, this.maxHealth);
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.8, depthWrite: false }));
    this.targetRing.visible = false;
    this.view.scene.add(this.targetRing);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x90e0ff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    this.reticle.visible = false;
    this.view.scene.add(this.reticle);
  }

  frameNode() {
    const name = el("div", { className: "combat-name" });
    const fill = el("div", { className: "combat-health-fill" });
    const text = el("span", { className: "combat-health-text" });
    const resources = el("div", { className: "combat-resources" });
    return { root: el("div", { className: "combat-frame" }, name, el("div", { className: "combat-health" }, fill, text), resources), name, fill, text, resources };
  }

  drawFrame(frame, health, most) {
    frame.fill.style.width = `${most ? (100 * health) / most : 0}%`;
    frame.text.textContent = most ? `${Math.round(health)} / ${Math.round(most)}` : "";
  }

  setClass(made) {
    if (!made) return;
    this.made = made;
    this.buttons = new Map();
    this.actionNodes = new Map();
    this.known = knownAbilities(made, this.you.level ?? 1);
    const abilities = this.known.slice(0, KEYS.length);
    this.attackButton = el("button", { type: "button", className: "combat-action", title: "Auto-attack your target, or stop" }, el("span", { className: "combat-action-key", textContent: ATTACK_KEY }), el("span", { className: "combat-action-name", textContent: "Attack" }));
    this.attackButton.addEventListener("click", () => this.toggleAttack());
    this.bar.replaceChildren(
      this.attackButton,
      ...abilities.map((ability, i) => {
        const shade = el("div", { className: "combat-action-shade" });
        const button = el("button", { type: "button", className: "combat-action", title: ability.description ?? ability.name }, el("span", { className: "combat-action-key", textContent: KEYS[i] }), el("span", { className: "combat-action-name", textContent: ability.name }), shade);
        button.addEventListener("click", () => this.useAt(i));
        this.buttons.set(ability.id, shade);
        this.actionNodes.set(ability.id, button);
        return button;
      }),
    );
    this.drawResources();
  }

  drawResources() {
    if (!this.made) return;
    this.youFrame.resources.replaceChildren(
      ...shownResources(this.made, this.known).map((r) => {
        const have = this.resources[r.key] ?? 0;
        const most = this.resourceMax[r.key] ?? r.max ?? 0;
        const fill = el("div", { className: "combat-resource-fill", style: `width: ${most ? (100 * have) / most : 0}%; background: ${r.color ?? "#ccd"}` });
        return el("div", { className: "combat-resource" }, fill, el("span", { className: "combat-resource-text", textContent: `${r.name ?? r.key} ${Math.round(have)}${most ? ` / ${most}` : ""}` }));
      }),
    );
  }

  bind() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Tab") {
        e.preventDefault();
        this.tabTarget();
        return;
      }
      if (e.key === "Escape" && this.aiming) {
        e.stopImmediatePropagation();
        this.stopAiming();
        return;
      }
      if (e.key === ATTACK_KEY) {
        this.toggleAttack();
        return;
      }
      const at = KEYS.indexOf(e.key);
      if (at >= 0) this.useAt(at);
    }, { capture: true });
    window.addEventListener("pointermove", (e) => this.aim(e), { capture: true });
    this.view.walker.onTap = (e) => this.tap(e);
  }

  // Everyone you can see: { id, drawn, x, y on screen, gap in feet from you }.
  visible() {
    const { camera, canvas, walker } = this.view;
    const box = canvas.getBoundingClientRect();
    const out = [];
    for (const drawn of this.others.characters.values()) {
      const chest = drawn.model.position.clone();
      chest.y += drawn.height * 0.6;
      const projected = chest.clone().project(camera);
      if (projected.z > 1) continue;
      out.push({ id: drawn.id, drawn, x: box.left + ((projected.x + 1) / 2) * box.width, y: box.top + ((1 - projected.y) / 2) * box.height, gap: chest.distanceTo(walker.pos), onScreen: Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 });
    }
    return out;
  }

  tabTarget() {
    const next = nextTarget(this.visible().filter((u) => u.onScreen && u.gap <= TARGET_FT), this.target);
    this.setTarget(next?.id ?? null);
  }

  tap(e) {
    if (this.aiming) {
      const spot = this.groundUnder(e);
      if (spot) this.useOnSpot(spot);
      return;
    }
    this.setTarget(pickNearest(this.visible(), e.clientX, e.clientY)?.id ?? null);
  }

  setTarget(id) {
    this.target = id;
    this.drawTarget();
  }

  drawTarget() {
    const drawn = this.target !== null ? this.others.characters.get(this.target) : null;
    this.targetFrame.root.hidden = !drawn;
    this.targetRing.visible = Boolean(drawn);
    if (!drawn) return;
    this.targetFrame.name.textContent = drawn.name;
    this.drawFrame(this.targetFrame, drawn.health, drawn.maxHealth);
    this.targetFrame.resources.textContent = drawn.dps ? `${drawn.dps} damage a second` : "";
  }

  useAt(index) {
    const ability = this.known?.[index];
    if (!ability) return;
    if (ability.target === "ground") {
      this.aiming = ability;
      this.reticle.scale.setScalar((ability.effects ?? []).find((e) => e.radius)?.radius ?? 5);
      this.reticle.visible = true;
      return;
    }
    this.stopAiming();
    this.connection.use(ability.id, this.target ?? 0);
  }

  // Starts auto-attacking your target, or stops.
  toggleAttack() {
    this.connection.attack(this.attacking ? 0 : this.target ?? 0);
    if (!this.attacking && !this.target) this.refused({ why: "you need an enemy targeted" });
  }

  useOnSpot(spot) {
    const ability = this.aiming;
    this.stopAiming();
    this.connection.use(ability.id, 0, [spot.x, spot.y, spot.z]);
  }

  stopAiming() {
    this.aiming = null;
    this.reticle.visible = false;
  }

  aim(e) {
    if (!this.aiming) return;
    const spot = this.groundUnder(e);
    if (spot) {
      this.reticle.position.copy(spot);
      this.reticle.position.y += 0.2;
    }
  }

  // The ground under the pointer: walks along the ray from the camera until it's below the land.
  groundUnder(e) {
    const { camera, canvas, renditions } = this.view;
    const box = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), camera);
    const at = ray.ray.origin.clone();
    for (let gone = 0; gone < RETICLE_FT; gone += RETICLE_STEP_FT) {
      at.addScaledVector(ray.ray.direction, RETICLE_STEP_FT);
      const ground = renditions.heightAt(at.x, at.z);
      if (ground !== null && ground !== undefined && at.y <= ground) return at.clone().setY(ground);
    }
    return null;
  }

  // A unit as the stage wants it, for someone drawn or for you.
  unit(id) {
    const { walker } = this.view;
    if (id === this.you.id) {
      const roles = roleClips(walker.look, skeletonOf(walker.look.body));
      return { mesh: walker.model, height: walker.look.height ?? 6, clip: (role, loop) => walker.act(role === null ? null : walker.clips && clipNameFor(role, roles, walker.clips), loop) };
    }
    const drawn = this.others.characters.get(id);
    if (!drawn) return null;
    const roles = roleClips(drawn.look, skeletonOf(drawn.look.body));
    return { mesh: drawn.model, height: drawn.height, clip: (role, loop) => this.others.act(drawn, role === null ? null : drawn.clips && clipNameFor(role, roles, drawn.clips), loop) };
  }

  // What the game server says.
  async used({ id, class: classId, ability: abilityId, target, spot, gcd }) {
    if (id === this.you.id && gcd) this.gcdUntil = performance.now() + gcd * 1000;
    const made = await this.classOf(classId);
    const ability = made?.abilities?.find((a) => a.id === abilityId);
    const caster = this.unit(id);
    if (!ability || !caster) return;
    // Only the latest run's bar shows, and only its end takes the bar away.
    const on = {};
    const run = this.stage.play(ability, { caster, target: target ? this.unit(target) : null, spot: spot ? new THREE.Vector3(...spot) : null, on });
    if (id === this.you.id) on.bar = (event) => this.runs.get(id) === run && this.showBar(event);
    this.runs.set(id, run);
  }

  swung({ id }) {
    this.unit(id)?.clip("attack");
  }

  attacking_({ target }) {
    this.attacking = target;
    this.attackButton?.classList.toggle("combat-action-on", Boolean(target));
  }

  stopped({ id }) {
    const run = this.runs.get(id);
    if (run) this.stage.stop(run);
    this.runs.delete(id);
    if (id === this.you.id) this.showBar(null);
  }

  statusChanged_({ id, status, from, stacks }) {
    if (from === this.you.id) this.statuses.get(id)?.set(status, stacks);
  }

  statusGone_({ id, status, from }) {
    if (from === this.you.id) this.statuses.get(id)?.delete(status);
  }

  // What the client knows of the facts conditions read. What it doesn't know stays undefined.
  facts() {
    const statuses = (id) => Object.fromEntries(this.statuses.get(id) ?? []);
    const drawn = this.target !== null ? this.others.characters.get(this.target) : null;
    return {
      self: { health: this.health, maxHealth: this.maxHealth, statuses: statuses(this.you.id) },
      target: drawn ? { health: drawn.health, maxHealth: drawn.maxHealth, statuses: statuses(this.target) } : null,
      resources: Object.fromEntries(Object.keys(this.resources).map((key) => [key, { have: this.resources[key], max: this.resourceMax[key] ?? 0 }])),
    };
  }

  logged({ kind, text }) {
    this.log.add(text, kind);
  }

  refused({ why }) {
    this.say.textContent = why;
    this.saidAt = performance.now();
  }

  cooldown({ ability, seconds }) {
    this.cooldowns.set(ability, performance.now() + seconds * 1000);
  }

  resources_({ resources, max }) {
    this.resources = resources;
    this.resourceMax = max ?? {};
    this.drawResources();
  }

  async hit(message) {
    const made = message.class ? await this.classOf(message.class) : null;
    const words = hitWords(message, made?.statuses ?? []);
    const unit = this.unit(message.on);
    if (words && unit) this.float(unit, words);
    this.setHealth(message.on, message.health, message.maxHealth, message.dps);
    if (words) this.note(message, words.text);
    if (message.status && message.from === this.you.id) {
      if (!this.statuses.has(message.on)) this.statuses.set(message.on, new Map());
      this.statuses.get(message.on).set(message.status, message.stacks ?? 1);
    }
    if (message.status && unit) {
      const aura = made?.statuses?.find((s) => s.id === message.status)?.aura;
      if (aura?.effect) this.stage.spawn(aura.effect, { colors: aura.colors?.length === 2 ? aura.colors : ["#ffffff", "#ffffff"], height: unit.height }, unit.mesh.position);
    }
  }

  health_({ id, health, maxHealth }) {
    this.setHealth(id, health, maxHealth, 0);
  }

  setHealth(id, health, maxHealth, dps) {
    if (id === this.you.id) {
      this.health = health;
      this.maxHealth = maxHealth;
      this.drawFrame(this.youFrame, health, maxHealth);
      return;
    }
    const drawn = this.others.characters.get(id);
    if (!drawn) return;
    drawn.health = health;
    drawn.maxHealth = maxHealth;
    drawn.dps = dps;
    if (id === this.target) this.drawTarget();
  }

  nameOf(id) {
    return id === this.you.id ? "you" : this.others.characters.get(id)?.name ?? "someone";
  }

  note({ from, on, ability }, text) {
    const made = this.made?.abilities?.find((a) => a.id === ability);
    this.log.add(`${this.nameOf(from)}: ${made?.name ?? ability ?? "attack"} on ${this.nameOf(on)}: ${text}`);
  }

  float(unit, { text, kind }) {
    const node = el("div", { className: `combat-float combat-float-${kind}`, textContent: text });
    this.floatLayer.append(node);
    this.floats.push({ node, unit, at: performance.now(), shift: this.floats.length % 3 });
  }

  showBar(event) {
    this.casting = event ? { from: performance.now(), length: (event.until - event.at) * 1000, draining: event.draining } : null;
    this.castBar.hidden = !event;
    if (event) this.castBar.querySelector(".combat-cast-label").textContent = event.label ?? "";
  }

  // Called each frame of the walk.
  frame(dt) {
    this.stage.frame(dt);
    const now = performance.now();
    if (this.casting) {
      const u = Math.min(1, (now - this.casting.from) / Math.max(1, this.casting.length));
      this.castBar.firstChild.style.width = `${(this.casting.draining ? 1 - u : u) * 100}%`;
      if (u >= 1) this.showBar(null);
    }
    if (this.buttons) {
      const facts = this.facts();
      for (const [id, shade] of this.buttons) {
        const ready = Math.max(this.cooldowns.get(id) ?? 0, this.gcdUntil);
        shade.style.height = ready > now ? "100%" : "0";
        const ability = this.known.find((a) => a.id === id);
        this.actionNodes.get(id).classList.toggle("combat-action-off", !allHold(ability.requires, facts));
      }
    }
    if (this.saidAt && now - this.saidAt > REFUSED_S * 1000) {
      this.say.textContent = "";
      this.saidAt = null;
    }
    this.drawTargetRing();
    this.drawFloats(now);
  }

  drawTargetRing() {
    const drawn = this.target !== null ? this.others.characters.get(this.target) : null;
    if (this.target !== null && !drawn) this.setTarget(null);
    if (!drawn) return;
    this.targetRing.position.copy(drawn.model.position);
    this.targetRing.position.y += 0.2;
    this.targetRing.scale.setScalar(Math.max(2, drawn.height * 0.5));
  }

  drawFloats(now) {
    const { camera, canvas } = this.view;
    const box = canvas.getBoundingClientRect();
    this.floats = this.floats.filter((float) => {
      const u = (now - float.at) / (FLOAT_S * 1000);
      if (u >= 1) {
        float.node.remove();
        return false;
      }
      const at = chestOf(float.unit).add(new THREE.Vector3(0, float.unit.height * 0.5 + u * 3, 0)).project(camera);
      if (at.z > 1) {
        float.node.style.opacity = "0";
        return true;
      }
      float.node.style.left = `${((at.x + 1) / 2) * box.width}px`;
      float.node.style.top = `${((1 - at.y) / 2) * box.height + float.shift * 18}px`;
      float.node.style.opacity = String(1 - u * u);
      return true;
    });
  }
}
