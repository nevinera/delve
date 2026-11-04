import { costWords } from "./abilitiesPane.js";
import { attackGroup } from "../character/weapons.js";

const WIELDING = { shield: "Shield", oneHanded: "One-Handed Weapon", twoHanded: "Two-Handed Weapon", dual: "Two Weapons" };

const seconds = (s) => (s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s} sec`);

const rangeWords = (range) => (range === "melee" ? "Melee Range" : range ? `${range} ft range` : "");

const castWords = ({ castTime, channel }) => (channel ? "Channeled" : castTime ? `${seconds(castTime)} cast` : "Instant");

const cooldownWords = ({ cooldown, charges }) => {
  if (!cooldown) return "";
  return charges > 1 ? `${seconds(cooldown)} cooldown, ${charges} charges` : `${seconds(cooldown)} cooldown`;
};

// Whether someone's look holds what `wielding` asks for.
export function isHolding(wielding, { weapon, offhand } = {}) {
  if (wielding === "shield") return offhand === "shield";
  if (wielding === "twoHanded" || wielding === "oneHanded") return attackGroup(weapon) === wielding;
  if (wielding === "dual") return Boolean(offhand) && !["none", "shield", "orb"].includes(offhand);
  return true;
}

const canPay = (costs, resources) => costs.every(({ resource, amount, percent }) => percent || !amount || (resources[resource] ?? 0) >= amount);

// What a tooltip says about an ability, given what's true of you now: `resources`, what you have of
// each, `names`, what they're called, `look`, what you hold, and `cooldownLeft` in seconds.
export function tooltipWords(ability, { resources = {}, names = {}, look, cooldownLeft = 0 } = {}) {
  const costs = ability.cost ?? [];
  const wielding = ability.requires?.find((need) => need.wielding)?.wielding;
  return {
    name: ability.name ?? ability.id,
    rows: [
      { left: costWords(costs, names), right: rangeWords(ability.range), leftShort: !canPay(costs, resources) },
      { left: castWords(ability), right: cooldownWords(ability) },
    ].filter(({ left, right }) => left || right),
    needs: WIELDING[wielding] ? `Requires ${WIELDING[wielding]}` : "",
    missing: !isHolding(wielding, look),
    cooldownLeft: cooldownLeft > 0 ? `Cooldown remaining: ${seconds(Math.ceil(cooldownLeft))}` : "",
    description: ability.description ?? "",
  };
}

const el = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });

// The one box, in the corner of the screen, that describes the ability under the mouse.
export class AbilityTooltip {
  constructor() {
    this.root = el("div", "combat-tooltip");
    this.root.hidden = true;
    this.said = "";
  }

  show(ability, now) {
    const words = tooltipWords(ability, now);
    const said = JSON.stringify(words);
    this.root.hidden = false;
    if (said === this.said) return;
    this.said = said;
    const { name, rows, needs, missing, cooldownLeft, description } = words;
    const lines = [el("strong", "combat-tooltip-name", name)];
    for (const { left, right, leftShort } of rows) {
      const row = el("div", "combat-tooltip-row");
      row.append(el("span", leftShort ? "combat-tooltip-bad" : "", left), el("span", "", right));
      lines.push(row);
    }
    if (needs) lines.push(el("div", missing ? "combat-tooltip-bad" : "", needs));
    if (cooldownLeft) lines.push(el("div", "", cooldownLeft));
    if (description) lines.push(el("p", "combat-tooltip-words", description));
    this.root.replaceChildren(...lines);
  }

  hide() {
    this.said = "";
    this.root.hidden = true;
  }
}
