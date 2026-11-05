import { defaultPower, powerOf, setCoefficient } from "./abilityChoices.js";
import { readAmount, setKey } from "./form.js";

// The choices the status form offers, and what picking each does to the status. Nothing here draws.
// Strips are as choiceStrip.js has them.

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const seconds = (n) => (n < 60 ? `${n} s` : `${n / 60} min`);
const rounded = (n) => Math.round(n * 100) / 100;

// Whether it's held as a passive, which has it from a level on, for good.
export const isPassive = (made, id) => (made.passives ?? []).some((p) => p.status === id) || (made.specializations ?? []).some((s) => s.status === id);

export const kindStrip = (status) => ({ name: "how it shows", options: options([["buff", "Buff"], ["debuff", "Debuff"], ["hidden", "Hidden"]]), value: status.kind ?? "buff", pick: (v) => (status.kind = v) });

export const durationStrip = (status) => ({
  name: "how long it lasts",
  options: [{ value: 0, label: "Until removed" }, ...[4, 6, 8, 12, 20, 30, 60].map((value) => ({ value, label: seconds(value) }))],
  value: status.duration ?? 0,
  other: "s",
  pick: (v) => {
    setKey(status, "duration", v || undefined);
    if (!status.duration) {
      for (const key of ["dispel", "stacking", "maxStacks"]) delete status[key];
    }
  },
});

// Left out, a status starts over when it's put on again.
export const stackingStrip = (status) => ({
  name: "landing it again",
  options: options([["replace", "Landing it again starts it over"], ["refresh", "Landing it again tops it up"], ["stack", "It stacks"]]),
  value: status.stacking ?? "replace",
  pick: (v) => {
    setKey(status, "stacking", v === "replace" ? undefined : v);
    if (v === "stack") status.maxStacks ??= 3;
    else delete status.maxStacks;
  },
});

export const maxStacksStrip = (status) => (status.stacking === "stack" ? { name: "most stacks", options: [2, 3, 5, 10].map((value) => ({ value, label: `Up to ${value}` })), value: status.maxStacks, other: "stacks", pick: (v) => setKey(status, "maxStacks", v) } : null);

const DISPELS = [["", "Can't be dispelled"], ["magic", "Magic"], ["curse", "Curse"], ["poison", "Poison"], ["disease", "Disease"], ["enrage", "Enrage"]];
export function dispelStrip(status) {
  const value = status.dispel ?? "";
  return {
    name: "dispel",
    options: [...options(DISPELS), ...(DISPELS.some(([v]) => v === value) ? [] : [{ value, label: value }])],
    value,
    pick: (v) => setKey(status, "dispel", v),
  };
}

// A stat that multiplies is changed in percent, and one that adds by a number.
const MULTIPLIES = ["damageDone", "healingDone", "damageTaken", "healingTaken", "threat", "movementSpeed", "attackSpeed"];
const STAT_LABELS = [
  ["damageDone", "Damage done"],
  ["damageTaken", "Damage taken"],
  ["healingDone", "Healing done"],
  ["healingTaken", "Healing taken"],
  ["movementSpeed", "Movement speed"],
  ["maxHealth", "Max health"],
  ["armor", "Armor"],
  ["critChance", "Crit chance"],
];
const MORE_STAT_LABELS = { attackSpeed: "Attack speed", threat: "Threat", attackPower: "Attack power", spellPower: "Spell power", strength: "Strength", agility: "Agility", intellect: "Intellect", stamina: "Stamina", haste: "Haste", mastery: "Mastery", versatility: "Versatility", leech: "Leech", avoidance: "Avoidance", dodge: "Dodge", parry: "Parry", block: "Block", critDamage: "Crit damage", critHealing: "Crit healing", critTaken: "Crit taken", resourceMax: "Most of a resource", resourceRegen: "Resource regen", resourceRest: "Resource at rest", resourceDecay: "Resource decay", resourceGain: "Resource gain", stealth: "Stealth", detection: "Detection", critRating: "Crit rating", hasteRating: "Haste rating", masteryRating: "Mastery rating", versatilityRating: "Versatility rating", leechRating: "Leech rating", avoidanceRating: "Avoidance rating", speedRating: "Speed rating" };

export function statStrip(effect, allStats) {
  const shown = STAT_LABELS.map(([value]) => value);
  return {
    name: "which stat",
    options: options(STAT_LABELS),
    more: allStats.filter((stat) => !shown.includes(stat)).map((value) => ({ value, label: MORE_STAT_LABELS[value] ?? value })),
    owner: effect,
    value: effect.stat,
    pick: (v) => {
      const percent = MULTIPLIES.includes(v) !== MULTIPLIES.includes(effect.stat);
      effect.stat = v;
      if (percent) {
        delete effect.add;
        delete effect.multiply;
        if (MULTIPLIES.includes(v)) effect.multiply = 1.1;
        else effect.add = 5;
      }
    },
  };
}

// A share as a percent change, written as `multiply`.
function percentStrip(name, effect) {
  return {
    name,
    options: [-50, -30, -10, 10, 30, 50].map((value) => ({ value, label: `${value > 0 ? "+" : "−"}${Math.abs(value)}%` })),
    value: effect.multiply === undefined ? undefined : rounded((effect.multiply - 1) * 100),
    other: "%",
    signed: true,
    pick: (v) => {
      delete effect.add;
      setKey(effect, "multiply", v === undefined ? undefined : rounded(1 + v / 100));
    },
  };
}

// Whether a stat's amount is one the choices can say. One with both, or a set, goes in the fold-out.
const plainAmount = (effect) => !(effect.add !== undefined && effect.multiply !== undefined) && effect.set === undefined;
export const statIsPercent = (effect) => effect.multiply !== undefined || (effect.add === undefined && MULTIPLIES.includes(effect.stat));

export function statAmountStrip(effect) {
  if (!plainAmount(effect)) return null;
  if (statIsPercent(effect)) return percentStrip("how much", effect);
  return {
    name: "how much",
    options: [-10, -5, 1, 5, 10, 25].map((value) => ({ value, label: `${value > 0 ? "+" : "−"}${Math.abs(value)}` })),
    value: effect.add,
    other: "",
    signed: true,
    pick: (v) => setKey(effect, "add", v),
  };
}

const STRENGTHS = { periodic: [0.05, 0.1, 0.2, 0.4], absorb: [1, 2, 3, 5] };
export function amountStrips(made, effect) {
  if (effect.type === "periodic" && effect.does === "resource") {
    return [{ name: "how much", options: [1, 2, 3, 5, 10].map((value) => ({ value, label: `+${value}` })), value: effect.amount, other: "", pick: (v) => setKey(effect, "amount", v) }];
  }
  const power = powerOf(made, effect);
  const [light, solid, heavy, huge] = STRENGTHS[effect.type];
  return [
    { name: "strength", options: options([[light, "Light"], [solid, "Solid"], [heavy, "Heavy"], [huge, "Huge"]]), value: readAmount(effect.amount)[power], other: "×", pick: (v) => setCoefficient(effect, power, v) },
    { name: "scales with", options: options([["attackPower", "Attack power"], ["spellPower", "Spell power"]]), value: power, pick: (v) => setCoefficient(effect, v, readAmount(effect.amount)[power] ?? solid) },
  ];
}

export const doesStrip = (effect) => ({
  name: "what it does over time",
  options: options([["damage", "Damage"], ["heal", "Heal"], ["resource", "Give a resource"]]),
  value: effect.does,
  pick: (v) => {
    if ((v === "resource") !== (effect.does === "resource")) delete effect.amount;
    effect.does = v;
    if (v === "resource") effect.amount = 1;
  },
});

export const everyStrip = (effect) => ({ name: "how often", options: [1, 2, 3, 5].map((value) => ({ value, label: `Every ${value} s` })), value: effect.every, other: "s", pick: (v) => setKey(effect, "every", v) });

const SCHOOLS = [["physical", "Physical"], ["holy", "Holy"], ["fire", "Fire"], ["nature", "Nature"], ["frost", "Frost"], ["shadow", "Shadow"], ["arcane", "Arcane"]];
export const periodicSchoolStrip = (effect) => ({ name: "school", options: SCHOOLS.map(([value, label]) => ({ value, label, swatch: value })), value: effect.school, pick: (v) => setKey(effect, "school", v) });

const CONTROLS = [["stun", "Stun"], ["root", "Root"], ["silence", "Silence"], ["incapacitate", "Incapacitate"], ["disorient", "Disorient"], ["fear", "Fear"], ["disarm", "Disarm"]];
export const controlStrip = (effect) => ({ name: "how it controls", options: options(CONTROLS), value: effect.control, pick: (v) => (effect.control = v) });

export const TRIGGER_LABELS = { dealDamage: "You deal damage", takeDamage: "You take damage", heal: "You heal", crit: "You crit", cast: "You cast", kill: "You kill", healthBelow: "Your health is low", statusGained: "It lands", statusEnds: "It ends", healed: "You're healed", overheal: "You overheal", nonCrit: "You don't crit", dodge: "You dodge", parry: "You parry", block: "You block", channelEnd: "A channel ends", spend: "You spend a resource", interrupt: "You interrupt", dispel: "You dispel", pickup: "You pick something up", allyHealthBelow: "An ally's health is low", wouldDie: "A hit would kill you", statusConsumed: "It's used up", dispelled: "It's dispelled", holderDies: "You die" };
const COMMON_TRIGGERS = ["dealDamage", "takeDamage", "heal", "crit", "cast", "kill", "healthBelow"];
const triggerOption = (value) => ({ value, label: TRIGGER_LABELS[value] ?? value });

export const triggerStrip = (effect) => ({
  name: "when it fires",
  options: COMMON_TRIGGERS.map(triggerOption),
  more: Object.keys(TRIGGER_LABELS).filter((key) => !COMMON_TRIGGERS.includes(key)).map(triggerOption),
  owner: effect,
  value: effect.on,
  pick: (v) => (effect.on = v),
});

export const chanceStrip = (effect) => ({
  name: "chance",
  options: [{ value: 100, label: "Always" }, ...[10, 25, 50].map((value) => ({ value, label: `${value}% chance` }))],
  value: effect.chance === undefined ? 100 : rounded(effect.chance * 100),
  other: "%",
  pick: (v) => setKey(effect, "chance", v === undefined || v === 100 ? undefined : v / 100),
});

export const triggerCooldownStrip = (effect) => ({
  name: "how often it can fire",
  options: [{ value: 0, label: "Every time" }, ...[1, 5, 10, 30].map((value) => ({ value, label: `At most every ${value} s` }))],
  value: effect.cooldown ?? 0,
  other: "s",
  pick: (v) => setKey(effect, "cooldown", v || undefined),
});

// What a modify changes. The ones in percent have choices for how much.
const CHANGE_LABELS = [["damage", "Damage"], ["healing", "Healing"], ["cooldown", "Cooldown"], ["castTime", "Cast time"], ["cost", "Cost"]];
const PERCENT_CHANGES = CHANGE_LABELS.map(([value]) => value);
export const changeIsPercent = (effect) => PERCENT_CHANGES.includes(effect.change) && plainAmount(effect) && effect.add === undefined;

export function changeStrip(effect, allChanges) {
  return {
    name: "what it changes",
    options: [{ value: "", label: "Adds something" }, ...options(CHANGE_LABELS)],
    more: allChanges.filter((change) => !PERCENT_CHANGES.includes(change)).map((value) => ({ value, label: value })),
    owner: effect,
    value: effect.change ?? "",
    pick: (v) => {
      setKey(effect, "change", v);
      if (PERCENT_CHANGES.includes(v) && effect.add === undefined && effect.multiply === undefined) effect.multiply = 1.1;
    },
  };
}

export const changeAmountStrip = (effect) => (changeIsPercent(effect) ? percentStrip("how much", effect) : null);

// The parts of an effect its card asks with choices. `drop` and `tuck` are as choiceStrip.js's foldOutFields has them.
export function statusFoldOut(effect) {
  const out = { drop: [], tuck: {}, quiet: [] };
  if (effect.type === "stat") {
    out.tuck.stat = "how much";
    if (plainAmount(effect)) out.drop.push("add", "multiply");
  } else if (effect.type === "periodic") {
    out.drop.push("does", "every", "school");
    out.tuck.amount = "how much";
  } else if (effect.type === "absorb") {
    out.tuck.amount = "how much";
  } else if (effect.type === "control") {
    out.drop.push("control");
  } else if (effect.type === "trigger") {
    out.drop.push("on", "effect");
    out.quiet.push("chance", "cooldown");
  } else if (effect.type === "modify") {
    out.drop.push("change");
    if (changeIsPercent(effect)) out.drop.push("add", "multiply", "set");
  }
  return out;
}

// The kinds of effect to offer, the likeliest for how it shows first.
const FIRST_EFFECTS = { debuff: ["periodic", "stat", "control"], buff: ["stat", "periodic", "absorb", "trigger", "modify"], hidden: ["stat", "trigger", "modify"] };
const ALL_EFFECTS = ["stat", "periodic", "absorb", "control", "trigger", "modify", "swing", "immune", "aura", "stealth", "transform", "store", "extraTargets", "gear", "untargetable", "redirectThreat", "countsAsStealthed", "stealthLinger", "stealthProtected", "none"];
const EFFECT_LABELS = { stat: "Change a stat", periodic: "Over time", absorb: "Shield", control: "Control", trigger: "When something happens", modify: "Change an ability", swing: "Change auto-attacks", immune: "Immunity", aura: "Aura", stealth: "Stealth", transform: "Transform", store: "Store what's done", extraTargets: "Extra targets", gear: "Allow gear", untargetable: "Untargetable", redirectThreat: "Redirect threat", countsAsStealthed: "Counts as stealthed", stealthLinger: "Stealth lingers", stealthProtected: "Stealth protected", none: "Nothing" };

export const statusEffectLabel = (type) => EFFECT_LABELS[type] ?? type;

export function statusEffectChoices(status) {
  const first = FIRST_EFFECTS[status.kind ?? "buff"] ?? FIRST_EFFECTS.buff;
  return { first, rest: ALL_EFFECTS.filter((type) => !first.includes(type)) };
}

// A new effect that works as it is, started on what's likeliest for how the status shows.
export function addStatusEffect(made, status, type) {
  const harmful = status.kind === "debuff";
  const power = defaultPower(made);
  const started = {
    stat: harmful ? { stat: "movementSpeed", multiply: 0.7 } : { stat: "damageDone", multiply: 1.1 },
    periodic: { does: harmful ? "damage" : "heal", every: 2, amount: { [power]: 0.1 } },
    absorb: { amount: { [power]: 2 } },
    control: { control: "stun" },
    trigger: { on: "dealDamage" },
  }[type];
  const effect = { type, ...started };
  status.effects = [...(status.effects ?? []), effect];
  return effect;
}

export function removeStatusEffect(status, effect) {
  status.effects = status.effects.filter((e) => e !== effect);
}

const signed = (n) => `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
const STAT_NAMES = Object.fromEntries([...STAT_LABELS, ...Object.entries(MORE_STAT_LABELS)]);

// A short line for each of its effects, to say what a status does where it isn't being edited.
export function statusSummary(status) {
  return (status.effects ?? []).map((effect) => {
    if (effect.type === "stat") {
      const name = STAT_NAMES[effect.stat] ?? effect.stat ?? "A stat";
      if (effect.multiply !== undefined) return `${name} ${signed(rounded((effect.multiply - 1) * 100))}%`;
      return effect.add !== undefined ? `${name} ${signed(effect.add)}` : name;
    }
    if (effect.type === "periodic") return `${effect.does === "heal" ? "Heals" : effect.does === "resource" ? "Gives a resource" : "Damages"} every ${effect.every ?? "?"} s`;
    if (effect.type === "control") return CONTROLS.find(([value]) => value === effect.control)?.[1] ?? "Control";
    if (effect.type === "trigger") return `When: ${(TRIGGER_LABELS[effect.on] ?? effect.on ?? "something happens").toLowerCase()}`;
    return statusEffectLabel(effect.type);
  });
}
