import { readAmount, setKey, writeAmount } from "./form.js";

// The choices the ability form offers, and what picking each does to the ability. Nothing here draws.
// A strip is { name, options: [{ value, label }], value, pick(value) }, with `other`, the unit of a
// number that's none of the options.

const AIMS = [
  ["enemy", "Enemy"],
  ["ally", "Ally"],
  ["self", "Yourself"],
  ["ground", "A spot on the ground"],
  ["any", "Enemy or ally"],
  ["none", "No target"],
];
const aimed = (ability) => ["enemy", "ally", "any"].includes(ability.target);
const needsRange = (ability) => aimed(ability) || ability.target === "ground";

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const seconds = (n) => (n < 60 ? `${n} s` : `${n / 60} min`);

// What an effect shows as who it lands on, and the rest of the effect's area from that.
export function whoOf(effect) {
  if (!["enemies", "allies"].includes(effect.affects)) return effect.affects;
  return `${effect.affects}:${effect.cone !== undefined ? "cone" : (effect.around ?? "self")}`;
}

export function setWho(effect, who) {
  const [affects, where] = who.split(":");
  effect.affects = affects;
  if (!where) {
    for (const key of ["around", "radius", "cone"]) delete effect[key];
    return;
  }
  setKey(effect, "around", ["self", "cone"].includes(where) ? undefined : where);
  setKey(effect, "cone", where === "cone" ? 90 : undefined);
  effect.radius ??= 8;
}

// Who an effect of this type can land on, for what the ability aims at.
const WHO_LABELS = { target: "The target", self: "You", "enemies:target": "Enemies around the target", "allies:target": "Allies around the target", "enemies:ground": "Enemies there", "allies:ground": "Allies there", "enemies:self": "Enemies around you", "allies:self": "Allies around you", "enemies:cone": "Enemies in front of you", hit: "Whoever it hits", holder: "The holder", caster: "The caster", summons: "Your summons" };

export function whoChoices(ability, effect) {
  const foe = effect.type !== "heal";
  const friend = effect.type !== "damage";
  const area = effect.type === "area";
  return [
    ...(aimed(ability) && !area ? ["target"] : []),
    ...(friend && !area ? ["self"] : []),
    ...(aimed(ability) && foe ? ["enemies:target"] : []),
    ...(aimed(ability) && friend ? ["allies:target"] : []),
    ...(ability.target === "ground" && foe ? ["enemies:ground"] : []),
    ...(ability.target === "ground" && friend ? ["allies:ground"] : []),
    ...(foe ? ["enemies:self"] : []),
    ...(friend ? ["allies:self"] : []),
    ...(foe && !area ? ["enemies:cone"] : []),
  ];
}

// The types whose card asks who they land on with choices, and not with a list.
const WITH_WHO = ["damage", "heal", "status", "dispel", "area"];

function firstWho(ability, type) {
  const hostile = type === "damage" || (type !== "heal" && !["ally", "any", "self"].includes(ability.target));
  if (type === "area") return `${hostile ? "enemies" : "allies"}:${ability.target === "ground" ? "ground" : aimed(ability) ? "target" : "self"}`;
  if (hostile) return ability.target === "enemy" || ability.target === "any" ? "target" : ability.target === "ground" ? "enemies:ground" : "enemies:self";
  if (["ally", "any"].includes(ability.target)) return "target";
  if (ability.target === "ground") return "allies:ground";
  return ability.target === "none" ? "allies:self" : "self";
}

// Picking what it aims at: the range it now needs, and effects that pointed at what it no longer has.
export function setAim(ability, target) {
  ability.target = target;
  if (!needsRange(ability)) {
    for (const key of ["range", "minRange", "speed"]) delete ability[key];
  } else if (target === "ground") {
    if (typeof ability.range !== "number") ability.range = 30;
    delete ability.speed;
  } else {
    ability.range ??= target === "enemy" ? "melee" : 40;
  }
  for (const effect of ability.effects ?? []) {
    if (!WITH_WHO.includes(effect.type)) continue;
    const who = whoOf(effect);
    const pointsAway = who === "target" || who.endsWith(":target") || who.endsWith(":ground");
    if (pointsAway && !whoChoices(ability, effect).includes(who)) setWho(effect, firstWho(ability, effect.type));
  }
}

export const aimStrip = (ability) => ({ name: "aim", options: options(AIMS), value: ability.target, pick: (v) => setAim(ability, v) });

export function reachStrip(ability) {
  if (!needsRange(ability)) return null;
  return {
    name: "reach",
    options: [...(ability.target === "ground" ? [] : [{ value: "melee", label: "Melee" }]), ...[20, 30, 40, 60].map((value) => ({ value, label: `${value} ft` }))],
    value: ability.range,
    other: "ft",
    pick: (v) => {
      setKey(ability, "range", v);
      if (v === "melee") delete ability.speed;
    },
  };
}

// Whether what it does lands at once or has to get there.
export function flightStrip(ability) {
  if (!aimed(ability) || typeof ability.range !== "number") return null;
  return {
    name: "flight",
    options: options([[0, "Lands at once"], [25, "Slow shot"], [50, "Fast shot"]]),
    value: ability.speed ?? 0,
    other: "ft/s",
    pick: (v) => setKey(ability, "speed", v || undefined),
  };
}

const SCHOOLS = [["physical", "Physical"], ["holy", "Holy"], ["fire", "Fire"], ["nature", "Nature"], ["frost", "Frost"], ["shadow", "Shadow"], ["arcane", "Arcane"]];
export const schoolStrip = (ability) => ({
  name: "school",
  options: [...SCHOOLS.map(([value, label]) => ({ value, label, swatch: value })), { value: "", label: "No school" }],
  value: ability.school ?? "",
  pick: (v) => setKey(ability, "school", v),
});

export const timingStrip = (ability) => ({
  name: "cast time",
  options: [{ value: 0, label: "Instant" }, ...[1, 1.5, 2, 2.5, 3].map((value) => ({ value, label: `${value} s cast` })), { value: "channel", label: "Channel" }],
  value: ability.channel ? "channel" : (ability.castTime ?? 0),
  other: "s cast",
  pick: (v) => {
    if (v === "channel") {
      delete ability.castTime;
      ability.channel ??= { duration: 3, ticks: 3 };
    } else {
      delete ability.channel;
      setKey(ability, "castTime", v || undefined);
    }
  },
});

export const cooldownStrip = (ability) => ({
  name: "cooldown",
  options: [{ value: 0, label: "No cooldown" }, ...[6, 10, 15, 30, 60, 120].map((value) => ({ value, label: seconds(value) }))],
  value: ability.cooldown ?? 0,
  other: "s",
  pick: (v) => setKey(ability, "cooldown", v || undefined),
});

// Costs: each of the class's resources can be on or off, and "free" takes them all off.
export const isFree = (ability) => !ability.cost?.length;
export const costOf = (ability, key) => ability.cost?.find((c) => c.resource === key);
export const setFree = (ability) => delete ability.cost;

export function toggleCost(made, ability, key) {
  if (costOf(ability, key)) {
    ability.cost = ability.cost.filter((c) => c.resource !== key);
    if (!ability.cost.length) delete ability.cost;
    return;
  }
  const points = made.resources?.find((r) => r.key === key)?.kind === "points";
  ability.cost = [...(ability.cost ?? []), { resource: key, amount: points ? 1 : 10 }];
}

// How strong a hit or a heal is: a coefficient of one of the caster's powers.
const defaultPower = (made) => (made.primaryStats?.[0] === "intellect" ? "spellPower" : "attackPower");

function powerOf(made, effect) {
  const parts = readAmount(effect.amount);
  if (parts.attackPower !== undefined) return "attackPower";
  return parts.spellPower !== undefined ? "spellPower" : defaultPower(made);
}

function setCoefficient(effect, power, coefficient) {
  const { attackPower, spellPower, ...rest } = readAmount(effect.amount);
  setKey(effect, "amount", writeAmount({ ...rest, ...(coefficient === undefined ? {} : { [power]: coefficient }) }));
}

export function strengthStrip(made, effect) {
  const power = powerOf(made, effect);
  return {
    name: "strength",
    options: options([[0.5, "Light"], [1, "Solid"], [1.5, "Heavy"], [2.5, "Huge"]]),
    value: readAmount(effect.amount)[power],
    other: "×",
    pick: (v) => setCoefficient(effect, power, v),
  };
}

export function powerStrip(made, effect) {
  const power = powerOf(made, effect);
  return {
    name: "scales with",
    options: options([["attackPower", "Attack power"], ["spellPower", "Spell power"]]),
    value: power,
    pick: (v) => setCoefficient(effect, v, readAmount(effect.amount)[power] ?? 1),
  };
}

export function whoStrip(ability, effect) {
  if (!WITH_WHO.includes(effect.type)) return null;
  const who = whoOf(effect);
  const offered = whoChoices(ability, effect);
  return {
    name: "who it lands on",
    options: [...offered, ...(offered.includes(who) ? [] : [who])].map((value) => ({ value, label: WHO_LABELS[value] ?? value })),
    value: who,
    pick: (v) => setWho(effect, v),
  };
}

export function radiusStrip(effect) {
  if (!["enemies", "allies"].includes(effect.affects) && effect.type !== "area") return null;
  return { name: "radius", options: [5, 8, 10, 15, 20, 30].map((value) => ({ value, label: `${value} ft` })), value: effect.radius, other: "ft", pick: (v) => setKey(effect, "radius", v) };
}

// Who a move moves goes with the kind: you, or those it knocks around.
const MOVES_YOU = ["charge", "leap", "blink", "dash", "leapBack", "behind"];
const MOVE_LABELS = [["charge", "Charge"], ["leap", "Leap"], ["blink", "Blink"], ["dash", "Dash"], ["leapBack", "Leap back"], ["behind", "Get behind"], ["knockback", "Knock back"], ["pull", "Pull"], ["knockup", "Knock up"]];

export function setMoveKind(ability, effect, kind) {
  effect.kind = kind;
  setWho(effect, MOVES_YOU.includes(kind) ? "self" : firstWho({ ...ability, target: ability.target === "self" ? "none" : ability.target }, "damage"));
  if (["knockback", "blink", "dash"].includes(kind)) effect.distance ??= 20;
  else delete effect.distance;
}

export const moveStrip = (ability, effect) => (effect.type === "move" ? { name: "how it moves", options: options(MOVE_LABELS), value: effect.kind, pick: (v) => setMoveKind(ability, effect, v) } : null);

export function resourceStrips(made, effect) {
  if (effect.type !== "resource") return [];
  return [
    { name: "which resource", options: (made.resources ?? []).map((r) => ({ value: r.key, label: r.name || r.key })), value: effect.resource, pick: (v) => setKey(effect, "resource", v) },
    { name: "how much", options: [1, 2, 3, 5, 10].map((value) => ({ value, label: `+${value}` })), value: effect.amount, other: "", pick: (v) => setKey(effect, "amount", v) },
  ];
}

// Which parts of an effect its card asks about with choices, so its fold-out needn't.
export const hasStrength = (effect) => ["damage", "heal"].includes(effect.type);

export function chosenOnCard(effect) {
  return [
    "type",
    ...(WITH_WHO.includes(effect.type) ? ["affects"] : []),
    ...(radiusStrip(effect) ? ["radius"] : []),
    ...(effect.type === "area" ? ["around"] : []),
    ...(effect.type === "move" ? ["kind"] : []),
    ...(effect.type === "resource" ? ["resource"] : []),
    ...(hasStrength(effect) || effect.type === "resource" ? ["amount"] : []),
  ];
}

// The kinds of effect to offer, the likeliest for what it aims at first.
const FIRST_EFFECTS = {
  enemy: ["damage", "status", "move", "interrupt", "resource"],
  ally: ["heal", "status", "dispel", "resource"],
  any: ["heal", "damage", "status", "dispel"],
  self: ["status", "heal", "move", "resource", "summon"],
  ground: ["area", "damage", "heal", "status", "move"],
  none: ["damage", "heal", "status", "area", "resource"],
};
const ALL_EFFECTS = ["damage", "heal", "status", "resource", "move", "dispel", "interrupt", "area", "taunt", "extend", "consume", "extraTargets", "castAbility", "threat", "reveal", "cooldown", "summon", "command", "resurrect"];
const EFFECT_LABELS = { damage: "Damage", heal: "Heal", status: "Status", resource: "Give a resource", move: "Movement", dispel: "Dispel", interrupt: "Interrupt", area: "Lasting area", taunt: "Taunt", extend: "Extend a status", consume: "Use up a status", extraTargets: "Extra targets", castAbility: "Cast another ability", threat: "Threat", reveal: "Reveal", cooldown: "Change a cooldown", summon: "Summon", command: "Command summons", resurrect: "Resurrect" };

export const effectLabel = (type) => EFFECT_LABELS[type] ?? type;

export function addLabel(ability, type) {
  if (type !== "status") return effectLabel(type);
  return ability.target === "enemy" ? "Debuff" : ["ally", "self"].includes(ability.target) ? "Buff" : "Status";
}

export function effectChoices(ability) {
  const first = FIRST_EFFECTS[ability.target] ?? FIRST_EFFECTS.enemy;
  return { first, rest: ALL_EFFECTS.filter((type) => !first.includes(type)) };
}

// A new effect, started on what's likeliest for this ability.
export function addEffect(made, ability, type) {
  const effect = { type };
  if (hasStrength(effect)) effect.amount = { [defaultPower(made)]: 1 };
  if (WITH_WHO.includes(type)) setWho(effect, firstWho(ability, type));
  else effect.affects = ["resource", "summon", "cooldown", "castAbility"].includes(type) || !aimed(ability) ? "self" : "target";
  if (type === "area") Object.assign(effect, { radius: 10, lasts: 8, every: 1 });
  if (type === "resource") Object.assign(effect, { resource: made.resources?.[0]?.key, amount: 1 });
  if (type === "interrupt") effect.lockout = 4;
  if (type === "move") setMoveKind(ability, effect, ability.target === "enemy" ? "charge" : ability.target === "ground" ? "leap" : "dash");
  if (type === "move" && effect.kind === "leap") effect.to = "ground";
  ability.effects = [...(ability.effects ?? []), effect];
  return effect;
}

export function removeEffect(ability, effect) {
  ability.effects = ability.effects.filter((e) => e !== effect);
}
