import { iconNode } from "../play/icons.js";
import { addEffect, addLabel, aimStrip, chosenOnCard, cooldownStrip, costOf, effectChoices, effectLabel, flightStrip, hasStrength, isFree, moveStrip, powerStrip, radiusStrip, reachStrip, removeEffect, resourceStrips, schoolStrip, setFree, strengthStrip, timingStrip, toggleCost, whoStrip } from "./abilityChoices.js";
import { ABILITY_SECTIONS, abilityFields, effectFields } from "./fields.js";
import { fold, renderFields, renderSections, setKey } from "./form.js";

// The ability form: rows of choices that say what they're asking by what they offer, each row showing
// once it means something. What the choices don't cover folds away below them.

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const svg = (inner) => {
  const box = document.createElement("span");
  box.className = "aim-picture";
  box.innerHTML = `<svg viewBox="0 0 64 36" width="64" height="36" aria-hidden="true">${inner}</svg>`;
  return box;
};
const YOU = `<circle cx="12" cy="18" r="6" fill="#d8c08a"/>`;
const AT = (color, y = 18) => `<path d="M21 ${(18 + y) / 2}H43" stroke="#888" stroke-width="2" stroke-dasharray="3 3"/><circle cx="52" cy="${y}" r="6" fill="${color}"/>`;
const ENEMY = "#e06060";
const ALLY = "#60c070";
const AIM_PICTURES = {
  enemy: YOU + AT(ENEMY),
  ally: YOU + AT(ALLY),
  self: `<circle cx="32" cy="18" r="6" fill="#d8c08a"/><circle cx="32" cy="18" r="12" fill="none" stroke="#d8c08a" stroke-width="2"/>`,
  ground: `${YOU}<path d="M21 18H36" stroke="#888" stroke-width="2" stroke-dasharray="3 3"/><ellipse cx="50" cy="20" rx="12" ry="6" fill="none" stroke="#aaa" stroke-width="2" stroke-dasharray="4 2"/>`,
  any: YOU + AT(ENEMY, 9) + AT(ALLY, 27),
  none: `<circle cx="32" cy="18" r="6" fill="#d8c08a"/>`,
};

const SCHOOL_COLORS = { physical: "#b8b0a0", holy: "#f0d870", fire: "#f07030", nature: "#60c060", frost: "#70c8f0", shadow: "#9060c0", arcane: "#d070e0" };
const EFFECT_ICONS = { damage: "crossed-swords", heal: "heart-drop", status: "checked-shield", resource: "stars-stack", move: "run", dispel: "cross-flare", interrupt: "stopwatch", area: "whirlwind" };

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

function choice(option, on, pick) {
  const button = el("button", { type: "button", className: "choice" });
  if (option.swatch) button.append(el("span", { className: "choice-swatch", style: `background:${SCHOOL_COLORS[option.swatch]}` }));
  button.append(option.label);
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", on);
  button.addEventListener("click", () => pick(option.value));
  return button;
}

// A row of choices. It has no heading: what's on offer says what it's asking.
function drawStrip(strip, { changed, reshaped }) {
  const pick = (value) => {
    strip.pick(value);
    reshaped();
  };
  const offered = strip.options.some((o) => o.value === strip.value);
  const node = el("div", { className: "choice-strip" }, ...strip.options.map((option) => choice(option, option.value === strip.value, pick)));
  node.dataset.strip = strip.name;
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", strip.name);
  if (strip.other !== undefined) {
    const input = el("input", { type: "number", min: 0, step: "any", className: "choice-other", placeholder: "other", value: !offered && typeof strip.value === "number" ? strip.value : "" });
    input.setAttribute("aria-label", `${strip.name}, another number`);
    input.addEventListener("input", () => {
      strip.pick(numberOf(input.value));
      changed();
    });
    input.addEventListener("change", reshaped);
    node.append(el("label", { className: "choice-other-box" }, input, strip.other));
  }
  return node;
}

function drawAims(strip, { reshaped }) {
  const node = el(
    "div",
    { className: "choice-strip aim-strip" },
    ...strip.options.map((option) => {
      const button = el("button", { type: "button", className: "choice aim-tile" }, svg(AIM_PICTURES[option.value]), el("span", { textContent: option.label }));
      button.classList.toggle("on", option.value === strip.value);
      button.setAttribute("aria-pressed", option.value === strip.value);
      button.addEventListener("click", () => {
        strip.pick(option.value);
        reshaped();
      });
      return button;
    }),
  );
  node.dataset.strip = strip.name;
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", strip.name);
  return node;
}

// An effect's own fields, less what its card's choices ask, for its fold-out. The amount and who it
// lands on are still there for what the choices can't say, without counting as anything set.
function cardFields(made, effect) {
  const chosen = chosenOnCard(effect);
  return effectFields(made).flatMap((field) => {
    const quietly = field.key === "around" || field.key === "cone" ? chosen.includes("affects") : false;
    if (field.advanced) return [quietly ? { ...field, quiet: true } : field];
    if (field.key === "school") return [{ ...field, advanced: "other" }];
    if (!chosen.includes(field.key)) return [field];
    if (field.key === "amount" || field.key === "affects") return [{ ...field, advanced: field.key === "amount" ? "how much" : "who it lands on", quiet: true }];
    return [];
  });
}

function drawEffect(made, ability, effect, hooks) {
  const remove = el("button", { type: "button", textContent: "×", title: "remove this", className: "effect-remove" });
  remove.setAttribute("aria-label", `remove ${effectLabel(effect.type)}`);
  remove.addEventListener("click", () => {
    removeEffect(ability, effect);
    hooks.reshaped();
  });
  const strips = [whoStrip(ability, effect), radiusStrip(effect), ...(hasStrength(effect) ? [strengthStrip(made, effect), powerStrip(made, effect)] : []), moveStrip(ability, effect), ...resourceStrips(made, effect)].filter(Boolean);
  const card = el(
    "div",
    { className: "effect-card" },
    el("div", { className: "effect-head" }, iconNode(EFFECT_ICONS[effect.type], "effect-icon") ?? "", el("span", { className: "effect-title", textContent: effectLabel(effect.type) }), remove),
    ...strips.map((strip) => drawStrip(strip, hooks)),
    ...renderFields(cardFields(made, effect), effect, hooks),
  );
  card.dataset.effect = effect.type;
  return card;
}

function drawAddEffect(made, ability, hooks) {
  const add = (type) => {
    addEffect(made, ability, type);
    hooks.reshaped();
  };
  const tile = (type) => {
    const button = el("button", { type: "button", className: "effect-add" }, iconNode(EFFECT_ICONS[type], "effect-icon") ?? "", addLabel(ability, type));
    button.dataset.add = type;
    button.addEventListener("click", () => add(type));
    return button;
  };
  const { first, rest } = effectChoices(ability);
  return el(
    "div",
    { className: "effect-adds" },
    el("div", { className: "choice-strip" }, ...first.map(tile)),
    fold({ owner: ability, name: "more effects", className: "form-advanced", summary: "other things it can do", startOpen: false, draw: () => [el("div", { className: "choice-strip" }, ...rest.map(tile))] }),
  );
}

function drawCost(made, ability, hooks) {
  const resources = made.resources ?? [];
  if (!resources.length) return [];
  const free = choice({ value: "free", label: "Free" }, isFree(ability), () => {
    setFree(ability);
    hooks.reshaped();
  });
  const pieces = resources.flatMap((resource) => {
    const held = costOf(ability, resource.key);
    const button = choice({ value: resource.key, label: resource.name || resource.key }, Boolean(held), () => {
      toggleCost(made, ability, resource.key);
      hooks.reshaped();
    });
    if (!held) return [button];
    const key = held.percent !== undefined ? "percent" : "amount";
    const input = el("input", { type: "number", min: 0, step: "any", className: "choice-other", value: held[key] ?? "" });
    input.setAttribute("aria-label", `how much ${resource.name || resource.key} it costs`);
    input.addEventListener("input", () => {
      setKey(held, key, numberOf(input.value));
      hooks.changed();
    });
    return [button, el("label", { className: "choice-other-box" }, input, key === "percent" ? "%" : "")];
  });
  const node = el("div", { className: "choice-strip" }, free, ...pieces);
  node.dataset.strip = "cost";
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", "cost");
  return [node];
}

export function abilityBuilder(made, ability, hooks) {
  const fields = abilityFields(made);
  const named = (...keys) => keys.map((key) => fields.find((field) => field.key === key));
  const [name, level, icon, description] = named("name", "level", "icon", "description");
  const [channel] = named("channel");
  const strip = (s) => (s ? [drawStrip(s, hooks)] : []);
  const started = ability.effects?.length > 0;
  return [
    el(
      "div",
      { className: "ability-head" },
      ...renderFields([icon, { ...name, placeholder: () => "name" }, level], ability, hooks),
      ...renderFields([{ ...description, placeholder: () => "what it says in the tooltip" }], ability, hooks),
    ),
    drawAims(aimStrip(ability), hooks),
    ...strip(reachStrip(ability)),
    ...strip(flightStrip(ability)),
    ...strip(schoolStrip(ability)),
    ...(ability.effects ?? []).map((effect) => drawEffect(made, ability, effect, hooks)),
    drawAddEffect(made, ability, hooks),
    // How long and how much mean nothing until it does something.
    ...(started || ability.castTime || ability.channel || ability.cooldown || ability.cost?.length
      ? [
          ...strip(timingStrip(ability)),
          ...(ability.channel ? renderFields([{ ...channel, collapsed: false, advanced: undefined, label: "channel" }], ability, hooks) : []),
          ...strip(cooldownStrip(ability)),
          ...drawCost(made, ability, hooks),
        ]
      : []),
    ...renderSections(ABILITY_SECTIONS, fields, ability, hooks),
  ];
}
