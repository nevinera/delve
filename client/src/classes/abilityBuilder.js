import { iconNode } from "../play/icons.js";
import { addEffect, addLabel, aimStrip, chosenOnCard, cooldownStrip, costOf, effectChoices, effectLabel, flightStrip, hasStrength, isFree, moveStrip, powerStrip, radiusStrip, reachStrip, removeEffect, resourceStrips, schoolStrip, setFree, strengthStrip, timingStrip, toggleCost, whoStrip } from "./abilityChoices.js";
import { ABILITY_SECTIONS, abilityFields, effectFields } from "./fields.js";
import { addRow, asStrip, choice, drawStrip, el, foldOutFields } from "./choiceStrip.js";
import { renderFields, renderSections, setKey } from "./form.js";
import { lookBuilder } from "./lookBuilder.js";

// The ability form: rows of choices that say what they're asking by what they offer, each row showing
// once it means something. What the choices don't cover folds away below them.

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

const EFFECT_ICONS = { damage: "crossed-swords", heal: "heart-drop", status: "checked-shield", resource: "stars-stack", move: "run", dispel: "cross-flare", interrupt: "stopwatch", area: "whirlwind" };

const numberOf = (text) => (text.trim() === "" ? undefined : Number(text));

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
  return asStrip(node, strip.name);
}

// An effect's own fields, less what its card's choices ask, for its fold-out.
function cardFields(made, effect) {
  const chosen = chosenOnCard(effect);
  const moved = ["amount", "affects"].filter((key) => chosen.includes(key));
  return foldOutFields(effectFields(made), {
    drop: chosen.filter((key) => !moved.includes(key)),
    tuck: Object.fromEntries(moved.map((key) => [key, key === "amount" ? "how much" : "who it lands on"])),
    quiet: chosen.includes("affects") ? ["around", "cone"] : [],
    move: { school: "other" },
  });
}

// An effect's card. `gone()` takes it away. Statuses use this for what a trigger does, with `ability`
// standing in for what the effect can land on.
export function abilityEffectCard(made, ability, effect, hooks, gone) {
  const remove = el("button", { type: "button", textContent: "×", title: "remove this", className: "effect-remove" });
  remove.setAttribute("aria-label", `remove ${effectLabel(effect.type)}`);
  remove.addEventListener("click", gone);
  const strips = [whoStrip(ability, effect), radiusStrip(effect), ...(hasStrength(effect) ? [strengthStrip(made, effect), powerStrip(made, effect)] : []), moveStrip(ability, effect), ...resourceStrips(made, effect)].filter(Boolean);
  const card = el(
    "div",
    { className: "effect-card" },
    el("div", { className: "effect-head" }, ...[iconNode(EFFECT_ICONS[effect.type], "effect-icon")].filter(Boolean), el("span", { className: "effect-title", textContent: effectLabel(effect.type) }), remove),
    ...strips.map((strip) => drawStrip(strip, hooks)),
    ...renderFields(cardFields(made, effect), effect, hooks),
  );
  card.dataset.effect = effect.type;
  return card;
}

// Tiles for adding an effect, the likeliest for what `ability` aims at first. `owner` remembers the fold-out.
export function effectAdds(ability, owner, add) {
  const { first, rest } = effectChoices(ability);
  return addRow({ first, rest, owner, add, label: (type) => addLabel(ability, type), icon: (type) => iconNode(EFFECT_ICONS[type], "effect-icon"), summary: "other things it can do" });
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
  return [asStrip(el("div", { className: "choice-strip" }, free, ...pieces), "cost")];
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
    ...(ability.effects ?? []).map((effect) =>
      abilityEffectCard(made, ability, effect, hooks, () => {
        removeEffect(ability, effect);
        hooks.reshaped();
      }),
    ),
    effectAdds(ability, ability, (type) => {
      addEffect(made, ability, type);
      hooks.reshaped();
    }),
    // How long and how much mean nothing until it does something.
    ...(started || ability.castTime || ability.channel || ability.cooldown || ability.cost?.length
      ? [
          ...strip(timingStrip(ability)),
          ...(ability.channel ? renderFields([{ ...channel, collapsed: false, advanced: undefined, label: "channel" }], ability, hooks) : []),
          ...strip(cooldownStrip(ability)),
          ...drawCost(made, ability, hooks),
          ...lookBuilder(ability, hooks),
        ]
      : []),
    ...renderSections(ABILITY_SECTIONS, fields, ability, hooks),
  ];
}
