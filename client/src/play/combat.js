import { SPEC_LEVEL, allowedBuild, heldStatuses, knownAbilities } from "./build.js";
import { drawBuildPanel } from "./buildPanel.js";
import { drawAbilitiesPane } from "./abilitiesPane.js";
import { AbilityTooltip } from "./abilityTooltip.js";
import { barsFor, cleared, cooldownText, placed, slotShows, swapped, sweepFor } from "./bars.js";
import { keyBindings, slotAction } from "./keys.js";
import * as THREE from "three";
import { chestOf, AbilityStage, clipNameFor } from "../abilities/stage.js";
import { DESKTOP_PARTICLES, PHONE_PARTICLES } from "../abilities/particles.js";
import { roleClips } from "../character/animations.js";
import { iconNode } from "./icons.js";
import { isTouch } from "./touch.js";
import { skeletonOf } from "../character/characterMesh.js";
import { strFromU8 } from "fflate";
import { allHold } from "./conditions.js";
import { PlayLog } from "./log.js";
import { swingLook } from "../abilities/timeline.js";
import { DESKTOP_SOUNDS, PHONE_SOUNDS } from "../abilities/sounds.js";
import { withBuiltins } from "../abilities/builtins.js";
import { Footsteps, stepSound } from "./footsteps.js";
import { LastingAuras } from "./lastingAuras.js";
import { absorbBand, initials, timeLeft } from "./unitStatuses.js";
import { EffectAreaMarks } from "./effectAreas.js";
import { blockedBy, isHelpless } from "./controls.js";

const AURA_CHECK_S = 0.25; // how often to see which status-long auras should be showing

// Fighting on the play page: frames for you and your target, an action bar, a cast bar, what lands
// floating over who it lands on, and a log. The game server decides everything: this asks it to use
// abilities, and shows what it says happened.

// Auto-attack, which every character has whatever its class. It goes on the bars like an ability,
// by an id no class ability can have (those are 8 characters).
export const ATTACK = { id: "attack", name: "Attack", icon: "crossed-swords", description: "Auto-attack your target, or stop." };
const NONE = { from: 0, until: 0 };
const later = (a, b) => (b && b.until > a.until ? b : a); // of two waits, the one that ends later
const FLOAT_S = 1.2;
const REFUSED_S = 2;
const PICK_PX = 60; // how far from someone's chest on screen a click still picks them
const TARGET_FT = 150; // how far Tab looks for someone to target
const RETICLE_STEP_FT = 1;
const RETICLE_FT = 300;
const LEVEL_UP_VOLUME = 0.35; // a little under combat sounds, which play at half of about as loud

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
export function hitWords(hit, statuses = [], abilities = []) {
  if (hit.missed) return { text: hit.avoided ?? "miss", kind: "miss" };
  if (hit.removed) return { text: `${statuses.find((s) => s.id === hit.removed)?.name ?? hit.removed} removed`, kind: "status" };
  if (hit.stopped) return { text: `${abilities.find((a) => a.id === hit.stopped)?.name ?? hit.stopped} interrupted`, kind: "status" };
  const crit = `${hit.crit ? "!" : ""}${hit.blocked ? " blocked" : ""}${hit.absorbed ? ` (${hit.absorbed} absorbed)` : ""}`;
  if (hit.effect === "damage") return { text: `${hit.amount ?? 0}${crit}`, kind: hit.ticked ? "damage combat-float-tick" : "damage" };
  if (hit.effect === "heal") return { text: `+${hit.amount}${crit}`, kind: hit.ticked ? "heal combat-float-tick" : "heal" };
  if (hit.effect === "status") return { text: statuses.find((s) => s.id === hit.status)?.name ?? hit.status, kind: "status" };
  return null;
}

// An ability as the server says it's being used, with what changes it counted. An older server's
// message leaves those out.
export function asUsed(ability, { castTime, channel, cost, school, schools, animation }) {
  return {
    ...ability,
    ...(castTime === undefined ? {} : { castTime }),
    ...(channel ? { channel: { ...ability.channel, ...channel } } : {}),
    ...(cost ? { cost } : {}),
    ...(school ? { school } : {}),
    ...(schools ? { schools } : {}),
    ...(animation ? { animation } : {}),
  };
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

// Whether a `modify` is about this ability, as the game server has it.
export function modifyPicks(effect, ability) {
  if (effect.abilities?.length || effect.tag) return Boolean(effect.abilities?.includes(ability.id) || (effect.tag && ability.tags?.includes(effect.tag)));
  return true;
}

export class PlayCombat {
  // you: the welcome's character. loader: the world's files. hud: the element to build in.
  // `commands` are the page's own, for its log (log.js). audio gives the page's AudioContext, and
  // interfaceSounds are its InterfaceSounds.
  constructor({ view, others, connection, loader, you, hud, unitStatuses, commands = {}, audio = null, interfaceSounds = null }) {
    this.commands = commands;
    Object.assign(this, { view, others, connection, loader, you, hud, unitStatuses, interfaceSounds });
    this.pageAudio = audio;
    this.classes = new Map(); // id -> a promise of its file
    this.target = null;
    this.stage = new AbilityStage(view.scene, { sounds: isTouch() ? PHONE_SOUNDS : DESKTOP_SOUNDS, ground: (x, z) => view.renditions?.heightAt(x, z), audio: () => this.audioContext(), particles: isTouch() ? PHONE_PARTICLES : DESKTOP_PARTICLES });
    this.runs = new Map(); // caster id -> its run
    this.floats = [];
    this.cooldowns = new Map(); // ability id -> { from, until }: when it started and when it's ready, in performance.now()
    this.lockouts = new Map(); // school -> { from, until }, the same
    this.controls = []; // the controls on you
    this.gcd = { from: 0, until: 0 };
    this.resources = {};
    this.resourceMax = {};
    this.chosen = { specialization: "", talents: {} }; // your specialization and talents
    this.buildBox = document.getElementById("playBuild");
    this.pane = document.getElementById("playAbilities");
    this.savedBars = null; // null until you've set them
    this.barPage = 0; // which bar a small screen shows
    document.querySelector("[data-abilities]")?.addEventListener("click", () => this.toggleAbilities());
    this.effectAreas = new EffectAreaMarks(view);
    this.auras = new LastingAuras(this.stage);
    this.footsteps = new Footsteps((_kind, { at, mine, landing }) => this.stage.sound("footstep", { ...stepSound({ mine, landing }), at }), {
      heightAt: (x, z) => view.renditions?.heightAt(x, z),
      waterAt: (x, z) => view.renditions?.waterAt(x, z),
      patternAt: (x, z) => view.renditions?.patternAt(x, z),
    });
    this.statuses = new Map(); // unit id -> the statuses you've put on it, as stacks by id
    this.statusLists = new Map(); // class id -> its statuses, null while its file loads
    this.health = you.health;
    this.maxHealth = you.maxHealth;
    this.aiming = null;
    this.build();
    this.bind();
    if (you.class) this.classOf(you.class).then((made) => this.setClass(made));
  }

  classOf(id) {
    if (!this.classes.has(id)) {
      this.classes.set(id, this.loader.file(`classes/${id}.json`).then((bytes) => withBuiltins(bytes ? JSON.parse(strFromU8(bytes)) : null)));
    }
    return this.classes.get(id);
  }

  audioContext() {
    if (this.pageAudio) return this.pageAudio();
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
    this.log = new PlayLog((line) => this.connection.command(line), this.commands);
    this.floatLayer = el("div", { className: "combat-floats" });
    this.tooltip = new AbilityTooltip();
    document.body.append(this.tooltip.root); // the HUD sits under the menu buttons, and this goes over them
    this.hovered = null;
    this.hud.replaceChildren(el("div", { className: "combat-frames" }, this.youFrame.root, this.targetFrame.root), this.floatLayer, this.say, this.castBar, this.bar, this.log.root);
    keyBindings().onChange(() => this.drawBars());
    this.log.keepLeftOf(this.bar);
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
    const shield = el("div", { className: "combat-health-absorb" });
    const text = el("span", { className: "combat-health-text" });
    const resources = el("div", { className: "combat-resources" });
    const statuses = el("div", { className: "combat-statuses" });
    return { root: el("div", { className: "combat-frame" }, name, el("div", { className: "combat-health" }, fill, shield, text), resources, statuses), name, fill, shield, text, resources, statuses };
  }

  drawFrame(frame, health, most) {
    frame.fill.style.width = `${most ? (100 * health) / most : 0}%`;
    frame.text.textContent = most ? `${Math.round(health)} / ${Math.round(most)}` : "";
  }

  setClass(made) {
    if (!made) return;
    this.made = made;
    const level = this.you.level ?? 1;
    const build = allowedBuild(made, this.chosen, level);
    this.known = knownAbilities(made, level, build);
    this.usable = [ATTACK, ...this.known]; // what can go on the bars
    if (!this.statuses.has(this.you.id)) this.statuses.set(this.you.id, new Map());
    const mine = this.statuses.get(this.you.id);
    for (const id of this.held ?? []) mine.delete(id);
    this.held = heldStatuses(made, level, build);
    for (const id of this.held) mine.set(id, 1);
    this.drawBuild();
    if (level >= SPEC_LEVEL && !build.specialization && made.specializations?.length && !this.askedBuild) {
      this.askedBuild = true;
      this.openBuild();
    }
    this.drawBars();
    this.drawPane();
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

  // The bars and their buttons. Past the first bar, an empty slot only shows while you're arranging
  // them, and keeps its place so each slot stays over the same key on the bar below.
  drawBars() {
    if (!this.made) return;
    this.bars = barsFor(this.savedBars, this.usable);
    this.slots = [];
    this.hideTooltip();
    const arranging = !this.pane?.hidden;
    const rows = this.bars.map((bar, b) => {
      const row = el("div", { className: b === this.barPage ? "combat-bar" : "combat-bar combat-bar-away" });
      row.hidden = b > 0 && !arranging && !bar.some((id) => this.knownById(id));
      bar.forEach((id, s) => {
        const ability = this.knownById(id);
        const button = this.slotButton(b, s, ability);
        button.classList.toggle("combat-action-unused", !slotShows(b, ability, arranging));
        row.append(button);
      });
      return row;
    });
    if (!this.pageButton) {
      this.pageButton = el("button", { type: "button", className: "combat-action combat-page", title: "Show another action bar" });
      this.pageButton.addEventListener("click", () => {
        const shown = this.bars.map((bar, b) => b).filter((b) => b === 0 || this.bars[b].some((id) => this.knownById(id)));
        this.barPage = shown[(shown.indexOf(this.barPage) + 1) % shown.length];
        this.drawBars();
      });
    }
    this.pageButton.textContent = `bar ${this.barPage + 1}`;
    const box = el("div", { className: `combat-bars${arranging ? " combat-bars-arranging" : ""}` }, ...rows);
    this.bar.replaceChildren(el("div", { className: "combat-bar-side" }, this.pageButton), box);
    this.castBar.style.bottom = `${innerHeight - this.bar.getBoundingClientRect().top + 10}px`;
  }

  knownById(id) {
    return id ? this.usable.find((a) => a.id === id) : null;
  }

  slotButton(bar, slot, ability) {
    const at = { bar, slot };
    const shade = el("div", { className: "combat-action-shade" });
    const count = el("span", { className: "combat-action-count" });
    const button = el("button", { type: "button", className: `combat-action${ability ? "" : " combat-action-empty"}` }, el("span", { className: "combat-action-key", textContent: keyBindings().label(slotAction(bar, slot)) }), el("span", { className: "combat-action-name", textContent: ability?.name ?? "" }), shade, count);
    const icon = iconNode(ability?.icon, "combat-action-icon");
    if (icon) {
      button.prepend(icon);
      button.classList.add("combat-action-iconed");
    }
    if (this.pickedSlot?.bar === bar && this.pickedSlot?.slot === slot) button.classList.add("combat-action-on");
    button.addEventListener("click", () => (this.pane?.hidden ? this.useSlot(at) : this.tapSlot(at)));
    button.draggable = Boolean(ability);
    button.addEventListener("dragstart", (e) => {
      if (this.pane?.hidden) return e.preventDefault();
      e.dataTransfer.setData("text/plain", JSON.stringify({ from: at }));
      e.dataTransfer.setDragImage(button, 0, 0); // held by its corner, so you can see where it'll land
    });
    button.addEventListener("dragend", (e) => {
      if (!this.pane?.hidden && e.dataTransfer.dropEffect === "none") this.setBars(cleared(this.bars, at));
    });
    button.addEventListener("dragover", (e) => e.preventDefault());
    button.addEventListener("drop", (e) => {
      e.preventDefault();
      const { ability: id, from } = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      if (id) this.setBars(placed(this.bars, at, id));
      else if (from) this.setBars(swapped(this.bars, from, at));
    });
    if (ability) {
      button.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        this.hovered = ability;
        this.showTooltip();
      });
      button.addEventListener("pointerleave", () => this.hideTooltip());
      button.addEventListener("dragstart", () => this.hideTooltip());
    }
    if (ability) this.slots.push({ id: ability.id, ability, shade, count, node: button, label: button.querySelector(".combat-action-name") });
    return button;
  }

  // Says what the ability under the mouse comes to, and what's true of you for it now.
  showTooltip() {
    const shown = this.inForce(this.hovered);
    const ready = this.cooldowns.get(shown.id)?.until ?? 0;
    this.tooltip.show(shown, {
      resources: this.resources,
      names: Object.fromEntries((this.made?.resources ?? []).map(({ key, name }) => [key, name ?? key])),
      look: this.view.walker?.look,
      cooldownLeft: (ready - performance.now()) / 1000,
    });
  }

  hideTooltip() {
    this.hovered = null;
    this.tooltip.hide();
  }

  // While you're arranging the bars, a tap places what you picked, or picks up or moves a slot.
  tapSlot(at) {
    if (this.pickedAbility) {
      const id = this.pickedAbility;
      this.pickedAbility = null;
      this.setBars(placed(this.bars, at, id));
      this.drawPane();
    } else if (!this.pickedSlot) {
      this.pickedSlot = this.bars[at.bar][at.slot] ? at : null;
      this.drawBars();
    } else {
      const from = this.pickedSlot;
      this.pickedSlot = null;
      this.setBars(from.bar === at.bar && from.slot === at.slot ? cleared(this.bars, at) : swapped(this.bars, from, at));
    }
  }

  setBars(bars) {
    this.savedBars = bars;
    this.connection.saveBars(bars);
    this.drawBars();
  }

  toggleAbilities() {
    if (!this.pane || !this.made) return;
    this.pane.hidden = !this.pane.hidden;
    this.pickedAbility = this.pickedSlot = null;
    this.drawPane();
    this.drawBars();
  }

  drawPane() {
    if (!this.pane || this.pane.hidden || !this.made) return;
    const passives = this.held.map((id) => this.made.statuses?.find((s) => s.id === id)).filter(Boolean);
    drawAbilitiesPane(this.pane, { known: this.usable, passives, picked: this.pickedAbility }, {
      onPick: (id) => {
        this.pickedAbility = id;
        this.pickedSlot = null;
        this.drawPane();
        this.drawBars();
      },
      onClose: () => this.toggleAbilities(),
    });
  }

  // The bars you set, which the server keeps.
  bars_({ bars }) {
    this.savedBars = bars;
    this.drawBars();
  }

  // What the server says you've chosen.
  build_({ specialization, talents }) {
    // The server tells you this as you enter too, and only asking for it gets a sound.
    this.buildAsked = false;
    this.buildRefused = "";
    this.chosen = { specialization, talents: talents ?? {} };
    if (this.made) this.setClass(this.made);
  }

  openBuild() {
    if (!this.buildBox || !this.made) return;
    this.buildBox.hidden = false;
    this.drawBuild();
  }

  drawBuild() {
    if (!this.buildBox || this.buildBox.hidden || !this.made) return;
    const level = this.you.level ?? 1;
    drawBuildPanel(this.buildBox, { made: this.made, level, build: allowedBuild(this.made, this.chosen, level), refused: this.buildRefused }, (build) => {
      this.buildAsked = true;
      this.connection.chooseBuild(build);
    });
  }

  bind() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat || keyBindings().recording || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (e.key === "Escape" && this.aiming) {
        e.stopImmediatePropagation();
        this.stopAiming();
        return;
      }
      const action = keyBindings().actionFor(e);
      if (action?.id === "target") {
        e.preventDefault();
        this.tabTarget();
      } else if (action?.id === "spellbook") {
        e.preventDefault();
        this.toggleAbilities();
      } else if (action?.slot) {
        e.preventDefault();
        this.useSlot(action.slot);
      }
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
      if (this.unitStatuses.untargetable.has(drawn.id)) continue;
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

  // A frame's statuses, as icons with their stacks and time left. Hidden ones stay off it, and a
  // tap says what one is. The icons stay in place as their numbers change, so a tap can land.
  drawStatuses(frame, unit, now) {
    const shown = [];
    for (const held of this.unitStatuses.of(unit)) {
      const made = this.statusesOf(held.class)?.find((s) => s.id === held.status);
      if (made && made.kind !== "hidden") shown.push({ held, made });
    }
    const which = shown.map(({ held }) => `${held.status}/${held.from}`).join();
    if (frame.shownStatuses !== which) {
      frame.shownStatuses = which;
      frame.statusIcons = shown.map(({ made }) => {
        const words = `${made.name}${made.description ? `: ${made.description}` : ""}`;
        const stacks = el("span", { className: "combat-status-stacks" });
        const left = el("span", { className: "combat-status-left" });
        const root = el(
          "button",
          { className: `combat-status combat-status-${made.kind === "debuff" ? "debuff" : "buff"}`, title: words, onclick: () => this.refused({ why: words }) },
          iconNode(made.icon, "combat-status-picture") ?? el("span", { className: "combat-status-icon" }, initials(made.name)),
          stacks,
          left,
        );
        return { root, stacks, left };
      });
      frame.statuses.replaceChildren(...frame.statusIcons.map((icon) => icon.root));
    }
    shown.forEach(({ held }, i) => {
      const icon = frame.statusIcons[i];
      const stacks = held.stacks > 1 ? String(held.stacks) : "";
      const left = timeLeft(held.until, now);
      if (icon.stacks.textContent !== stacks) icon.stacks.textContent = stacks;
      if (icon.left.textContent !== left) icon.left.textContent = left;
    });
  }

  // What a unit can soak up, as a band on its health bar after what it has.
  drawAbsorb(frame, unit, health, most) {
    const [left, width] = absorbBand(health, this.unitStatuses.absorbs.get(unit) ?? 0, most);
    const style = `${left}% ${width}%`;
    if (frame.shownAbsorb === style) return;
    frame.shownAbsorb = style;
    frame.shield.style.left = `${left}%`;
    frame.shield.style.width = `${width}%`;
  }

  // The ability a slot's ability comes to right now: a status's `becomes` can turn it into another.
  inForce(ability) {
    if (ability.id === ATTACK.id) return ability;
    for (const held of this.unitStatuses.of(this.you.id)) {
      if (held.class !== this.made?.id && held.class !== this.you.class) continue;
      const made = this.made?.statuses?.find((s) => s.id === held.status);
      for (const effect of made?.effects ?? []) {
        if (effect.type === "modify" && effect.becomes && modifyPicks(effect, ability)) {
          return this.made.abilities?.find((a) => a.id === effect.becomes) ?? ability;
        }
      }
    }
    return ability;
  }

  // A class's statuses, once its file has loaded, and asks for it until then.
  statusesOf(classId) {
    if (!classId) return null;
    if (!this.statusLists.has(classId)) {
      this.statusLists.set(classId, null);
      this.classOf(classId).then((made) => this.statusLists.set(classId, made?.statuses ?? []));
    }
    return this.statusLists.get(classId);
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

  useSlot({ bar, slot }) {
    const ability = this.knownById(this.bars?.[bar]?.[slot]);
    if (!ability) return;
    if (ability.id === ATTACK.id) return this.toggleAttack();
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
      return { mesh: walker.model, mixer: walker.mixer, height: walker.look.height ?? 6, clip: (role, loop, speed) => walker.act(role === null ? null : walker.clips && clipNameFor(role, roles, walker.clips), loop, speed) };
    }
    const drawn = this.others.characters.get(id);
    if (!drawn) return null;
    const roles = roleClips(drawn.look, skeletonOf(drawn.look.body));
    return { mesh: drawn.model, mixer: drawn.mixer, height: drawn.height, clip: (role, loop, speed) => this.others.act(drawn, role === null ? null : drawn.clips && clipNameFor(role, roles, drawn.clips), loop, speed) };
  }

  // What the game server says.
  async used({ id, class: classId, ability: abilityId, target, spot, gcd, castTime, channel, cost, school, schools, animation }) {
    if (id === this.you.id && gcd) this.gcd = { from: performance.now(), until: performance.now() + gcd * 1000 };
    const made = await this.classOf(classId);
    const ability = made?.abilities?.find((a) => a.id === abilityId);
    const caster = this.unit(id);
    if (!ability || !caster) return;
    // Only the latest run's bar shows, and only its end takes the bar away.
    const on = this.yoursToShake(id);
    const run = this.stage.play(asUsed(ability, { castTime, channel, cost, school, schools, animation }), { caster, target: target ? this.unit(target) : null, spot: spot ? new THREE.Vector3(...spot) : null, on });
    if (id === this.you.id) on.bar = (event) => this.runs.get(id) === run && this.showBar(event);
    this.runs.set(id, run);
  }

  // Only what you do shakes your camera, and it's the last to be dropped if too many sounds are going.
  yoursToShake(id) {
    return id === this.you.id ? { mine: true, shake: (strength) => this.stage.shake(strength) } : {};
  }

  // The `swing` effects of the statuses someone has.
  swingEffectsOn(id) {
    return this.unitStatuses.of(id).flatMap((held) => {
      const status = this.statusesOf(held.class)?.find((s) => s.id === held.status);
      return (status?.effects ?? []).filter((effect) => effect.type === "swing");
    });
  }

  swung({ id, target }) {
    const unit = this.unit(id);
    if (unit) this.stage.swing(unit, this.unit(target), this.yoursToShake(id), swingLook(this.swingEffectsOn(id)));
  }

  attacking_({ target }) {
    this.attacking = target;
  }

  stopped({ id }) {
    const run = this.runs.get(id);
    if (run) this.stage.stop(run);
    this.runs.delete(id);
    if (id === this.you.id) this.showBar(null);
  }

  speed_({ movementSpeed }) {
    this.view.walker.speedShare = movementSpeed / 100;
  }

  effectArea_(message) {
    this.effectAreas.add(message, performance.now());
  }

  effectAreaGone_({ id }) {
    this.effectAreas.remove(id);
  }

  targetable_({ id, targetable }) {
    if (!targetable && id === this.target) this.setTarget(null);
  }

  controls_({ controls }) {
    this.controls = controls ?? [];
    this.view.walker.stunned = isHelpless(this.controls);
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

  refused({ why, ability }) {
    // The build panel covers where this usually shows.
    if (this.buildAsked && !ability) {
      this.buildAsked = false;
      this.buildRefused = why;
      this.drawBuild();
      this.interfaceSounds?.error();
    }
    this.say.textContent = why;
    this.saidAt = performance.now();
  }

  cooldown({ ability, seconds }) {
    this.cooldowns.set(ability, { from: performance.now(), until: performance.now() + seconds * 1000 });
  }

  lockout({ school, seconds }) {
    this.lockouts.set(school, { from: performance.now(), until: performance.now() + seconds * 1000 });
  }

  // The lockout on an ability's schools that lasts longest, or none.
  lockedFor(ability) {
    const schools = ability.schools ?? (ability.school ? [ability.school] : []);
    return schools.map((school) => this.lockouts.get(school)).reduce(later, NONE);
  }

  resources_({ resources, max }) {
    this.resources = resources;
    this.resourceMax = max ?? {};
    this.drawResources();
  }

  async hit(message) {
    const made = message.class ? await this.classOf(message.class) : null;
    const words = hitWords(message, made?.statuses ?? [], made?.abilities ?? []);
    const unit = this.unit(message.on);
    if (words && unit) this.float(unit, words);
    this.setHealth(message.on, message.health, message.maxHealth, message.dps);
    if (unit && !message.ability && !message.ticked) {
      const sound = message.missed ? "miss" : message.blocked ? "block" : "impact";
      this.stage.sound(sound, { at: unit.mesh.position.toArray(), mine: message.from === this.you.id, pitchVariation: 0.06 });
    }
    if (words) {
      const ticked = message.ticked && made?.statuses?.find((s) => s.id === message.ticked);
      if (message.ticked) this.log.add(`${this.nameOf(message.from)}: ${ticked?.name ?? message.ticked} ticks on ${this.nameOf(message.on)}: ${words.text}`);
      else this.note(message, words.text);
    }
    if (message.status && message.from === this.you.id) {
      if (!this.statuses.has(message.on)) this.statuses.set(message.on, new Map());
      this.statuses.get(message.on).set(message.status, message.stacks ?? 1);
    }
    if (message.status && unit) {
      const aura = made?.statuses?.find((s) => s.id === message.status)?.aura;
      if (aura?.effect && aura.duration !== "status") this.stage.aura(unit, aura);
    }
  }

  level_({ id, level }) {
    if (id !== this.you.id) return;
    // A quiet chime that comes from nowhere and is only yours.
    if (this.you.level !== undefined && level > this.you.level) this.stage.sound("level-up", { volume: LEVEL_UP_VOLUME });
    this.you.level = level;
    this.youFrame.name.textContent = `${this.you.name} (${level})`;
    this.setClass(this.made);
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
    const made = this.made?.abilities?.find((a) => a.id === ability) ?? this.made?.statuses?.find((s) => s.id === ability);
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

  // Called once everything's in place for this frame, as it's about to be drawn.
  placed() {
    this.stage.place();
    // Your ears are at your character's head, not at the camera behind it.
    const you = this.view.walker?.model;
    this.stage.hear(this.view.camera, you && [you.position.x, you.position.y + (this.view.walker.look?.height ?? 6) * 0.9, you.position.z]);
    this.view.camera.position.add(this.stage.shakeOffset());
  }

  // What status-long auras there should be right now: who has what, and how it looks.
  wantedAuras() {
    const wanted = new Map();
    for (const id of this.unitStatuses.units.keys()) {
      for (const held of this.unitStatuses.of(id)) {
        const aura = this.statusesOf(held.class)?.find((s) => s.id === held.status)?.aura;
        if (!aura?.effect || aura.duration !== "status") continue;
        const unit = this.unit(id);
        if (unit) wanted.set(`${id}/${held.status}/${held.from}`, { unit, aura });
      }
    }
    return wanted;
  }

  // Everyone drawn, for footsteps to listen for.
  walkingUnits() {
    const { walker } = this.view;
    const others = [...this.others.characters.values()].map(({ model, height }) => ({ mesh: model, height, mine: false }));
    return walker?.model ? [{ mesh: walker.model, height: walker.look?.height ?? 6, mine: true }, ...others] : others;
  }

  // Called each frame of the walk.
  frame(dt) {
    this.stage.frame(dt);
    this.footsteps.frame(dt, this.walkingUnits());
    this.auraWait = (this.auraWait ?? 0) - dt;
    if (this.auraWait <= 0) {
      this.auraWait = AURA_CHECK_S;
      this.auras.sync(this.wantedAuras());
    }
    const now = performance.now();
    if (this.casting) {
      const u = Math.min(1, (now - this.casting.from) / Math.max(1, this.casting.length));
      this.castBar.firstChild.style.width = `${(this.casting.draining ? 1 - u : u) * 100}%`;
      if (u >= 1) this.showBar(null);
    }
    if (this.hovered) this.showTooltip();
    if (this.slots) {
      const facts = this.facts();
      for (const slot of this.slots) {
        const { id, ability, shade, count, node, label } = slot;
        const force = this.inForce(ability);
        if (label && label.textContent !== (force.name ?? force.id)) label.textContent = force.name ?? force.id;
        const own = this.cooldowns.get(id) ?? NONE;
        const locked = this.lockedFor(ability);
        const sweep = sweepFor([own, locked, id === ATTACK.id ? NONE : this.gcd].reduce(later, NONE), now);
        if (slot.sweep !== sweep) shade.style.background = slot.sweep = sweep; // the page rewrites what it's given, so keep our own
        const left = cooldownText((own.until - now) / 1000);
        if (count.textContent !== left) count.textContent = left;
        node.classList.toggle("combat-action-locked", locked.until > now);
        node.classList.toggle("combat-action-attacking", id === ATTACK.id && Boolean(this.attacking));
        node.classList.toggle("combat-action-off", !allHold(ability.requires, facts) || Boolean(blockedBy(this.controls, ability)));
      }
    }
    this.effectAreas.frame(now, (id) => (id === this.you.id ? this.view.walker?.model?.position : this.others.characters.get(id)?.model.position));
    this.drawStatuses(this.youFrame, this.you.id, now);
    this.drawAbsorb(this.youFrame, this.you.id, this.health, this.maxHealth);
    const aimedAt = this.target !== null ? this.others.characters.get(this.target) : null;
    if (aimedAt) this.drawAbsorb(this.targetFrame, this.target, aimedAt.health, aimedAt.maxHealth);
    if (this.target !== null) this.drawStatuses(this.targetFrame, this.target, now);
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
