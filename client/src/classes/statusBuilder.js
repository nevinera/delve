import { iconNode } from "../play/icons.js";
import { abilityEffectCard, effectAdds } from "./abilityBuilder.js";
import { addEffect } from "./abilityChoices.js";
import { addRow, drawStrip, el, foldOutFields } from "./choiceStrip.js";
import { STATS, STATUS_SECTIONS, changesOf, statusEffectFields, statusFields } from "./fields.js";
import { renderFields, renderSections } from "./form.js";
import { auraStrip } from "./lookChoices.js";
import { addStatusEffect, amountStrips, chanceStrip, changeAmountStrip, changeStrip, controlStrip, dispelStrip, doesStrip, durationStrip, everyStrip, isPassive, kindStrip, maxStacksStrip, periodicSchoolStrip, removeStatusEffect, stackingStrip, statAmountStrip, statStrip, statusEffectChoices, statusEffectLabel, statusFoldOut, triggerCooldownStrip, triggerStrip } from "./statusChoices.js";

// The status form, as the ability form is: rows of choices, with the rest folded away below them.

const EFFECT_ICONS = { stat: "muscle-up", periodic: "hourglass", absorb: "healing-shield", control: "crossed-chains", trigger: "lightning-arc", modify: "upgrade", aura: "aura", immune: "checked-shield", stealth: "ghost" };
const iconOf = (type) => iconNode(EFFECT_ICONS[type], "effect-icon");

const stripsOf = (made, effect) => {
  if (effect.type === "stat") return [statStrip(effect, STATS), statAmountStrip(effect)];
  if (effect.type === "periodic") return [doesStrip(effect), everyStrip(effect), ...amountStrips(made, effect), ...(effect.does === "damage" ? [periodicSchoolStrip(effect)] : [])];
  if (effect.type === "absorb") return amountStrips(made, effect);
  if (effect.type === "control") return [controlStrip(effect)];
  if (effect.type === "trigger") return [triggerStrip(effect), chanceStrip(effect), triggerCooldownStrip(effect)];
  if (effect.type === "modify") return [changeStrip(effect, [...changesOf(made)()]), changeAmountStrip(effect)];
  return [];
};

// What a trigger does when it fires: an ability's effect, on a card of its own or to pick.
function triggerDoes(made, effect, hooks) {
  // Its `self` is the holder and its `target` who it happened with, as for an ability aimed at an enemy.
  const context = { target: "enemy", effects: [] };
  if (effect.effect) {
    return abilityEffectCard(made, context, effect.effect, hooks, () => {
      delete effect.effect;
      hooks.reshaped();
    });
  }
  return effectAdds(context, effect, (type) => {
    effect.effect = addEffect(made, context, type);
    hooks.reshaped();
  });
}

function drawEffect(made, status, effect, hooks) {
  const remove = el("button", { type: "button", textContent: "×", title: "remove this", className: "effect-remove" });
  remove.setAttribute("aria-label", `remove ${statusEffectLabel(effect.type)}`);
  remove.addEventListener("click", () => {
    removeStatusEffect(status, effect);
    hooks.reshaped();
  });
  const face = iconOf(effect.type);
  const fields = foldOutFields(statusEffectFields(made), statusFoldOut(effect)).filter((field) => field.key !== "type");
  const card = el(
    "div",
    { className: "effect-card" },
    el("div", { className: "effect-head" }, ...(face ? [face] : []), el("span", { className: "effect-title", textContent: statusEffectLabel(effect.type) }), remove),
    ...stripsOf(made, effect).filter(Boolean).map((strip) => drawStrip(strip, hooks)),
    ...(effect.type === "trigger" ? [triggerDoes(made, effect, hooks)] : []),
    ...renderFields(fields, effect, hooks),
  );
  card.dataset.effect = effect.type;
  return card;
}

export function statusBuilder(made, status, hooks) {
  const fields = statusFields(made);
  const named = (key) => fields.find((field) => field.key === key);
  const strip = (s) => (s ? [drawStrip(s, hooks)] : []);
  const { first, rest } = statusEffectChoices(status);
  // A passive is held for good, and nothing lands it twice or takes it off, unless it's been told otherwise.
  const lasts = !isPassive(made, status.id) || status.duration !== undefined;
  return [
    el(
      "div",
      { className: "ability-head status-head" },
      ...renderFields([named("icon"), { ...named("name"), placeholder: () => "name" }], status, hooks),
      ...renderFields([{ ...named("description"), placeholder: () => "what it says in the tooltip" }], status, hooks),
    ),
    drawStrip(kindStrip(status), hooks),
    ...(lasts ? strip(durationStrip(status)) : []),
    ...(status.duration ? [drawStrip(stackingStrip(status), hooks), ...strip(maxStacksStrip(status))] : []),
    ...(status.duration && status.kind !== "hidden" ? strip(dispelStrip(status)) : []),
    ...(status.effects ?? []).map((effect) => drawEffect(made, status, effect, hooks)),
    addRow({
      first,
      rest,
      owner: status,
      label: statusEffectLabel,
      icon: iconOf,
      summary: "other things it can do",
      add: (type) => {
        addStatusEffect(made, status, type);
        hooks.reshaped();
      },
    }),
    drawStrip(auraStrip(status), hooks),
    ...renderSections(STATUS_SECTIONS, fields, status, hooks),
  ];
}
