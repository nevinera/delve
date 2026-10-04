// Target numbers from docs/combat_balance.md, for the class and unit-type
// editors' estimate panels. Keep in step with that doc.

// A squishy (DPS-geared, no defensive stats) character at ee = 0.
export const SQUISHY_DPS = 25;
export const SQUISHY_EHP = 500;

// Going down in ee: the character kills `a` times slower and the enemy hits
// `b` times harder relative to its EHP.
const ELEVATIONS = {
  0: {a: 1, b: 1},
  [-5]: {a: 1.25, b: 1.2},
  [-10]: {a: 2.5, b: 1.3},
};

// Unit type balance tags, by category (see docs/schema/unit_type.md). Only
// roles may combine, and never tough with glass.
export const TAG_CATEGORIES = [
  {key: "intendedFor", label: "Intended for", exclusive: true, tags: ["open", "g1", "g2", "g3", "g5", "g10"]},
  {key: "pullSize", label: "Pull size", exclusive: true, tags: ["solo", "pair", "group", "swarm"]},
  {key: "role", label: "Role", exclusive: false, tags: ["healer", "tough", "debuffs", "buffs", "glass"]},
  {key: "damageType", label: "Damage type", exclusive: true, tags: ["caster", "melee", "ranged"]},
];

export const TAG_DESCRIPTIONS = {
  open: "open world", g1: "solo dungeon", g2: "2 players", g3: "3 players", g5: "5-player dungeon", g10: "10 players",
  solo: "1 unit", pair: "2 units", group: "3-4 units", swarm: "5-8 units",
};

// Roles that can't be combined.
export const EXCLUSIVE_ROLES = {tough: "glass", glass: "tough"};

// solo-pull, squishy, ee = 0. g5's are the single-character equivalent of
// its party targets (see combat_balance.md's "g5 enemies").
const INTENDED_FOR = {
  open: {ttk: 12, hpLost: 0.2},
  g1: {ttk: 30, hpLost: 0.65},
  g5: {ttk: 68.75, hpLost: 10},
};
const UNTARGETED = ["g2", "g3", "g10"];

// Keyed by the unit-type estimate's gearing plans.
export const GEAR_PROFILES = {
  offense: {label: "squishy", ttk: 1, ehp: 1},
  offenseWithDefense: {label: "tanky DPS", ttk: 1.25, ehp: 2},
  defense: {label: "tank", ttk: 1.5, ehp: 3},
  healing: {label: "healing", ttk: 1.5, ehp: 1},
};

// A class's stat priority name -> the gear profile it's measured against.
export const PRIORITY_PROFILES = {
  dps: "offense",
  hybrid: "offenseWithDefense",
  tank: "defense",
  healing: "healing",
};

// Priorities that can out-heal or out-mitigate a pull at ee = 0: surviving
// the whole cap is the target for them there, not a miss.
const SUSTAINING_PRIORITIES = ["tank", "healing"];

// Whole-pull TTK (T) and HP lost (L) relative to a solo pull, over n units.
const PULLS = {
  solo: {n: [1, 1], T: 1, L: 1},
  pair: {n: [2, 2], T: 1.3, L: 1.2},
  group: {n: [3, 4], T: 1.6, L: 1.4},
  swarm: {n: [5, 8], T: 1.9, L: 1.6},
};

const ROLES = {
  glass: {hp: 0.5, dps: 1.3},
  tough: {hp: 2, dps: 0.5},
  buffs: {hp: 1, dps: 0.85},
  debuffs: {hp: 1, dps: 0.85},
  healer: {hp: 0.67, dps: 1},
};

// Per-unit multipliers on a solo unit's HP and net DPS, at pull size n.
function pullUnitMultipliers(pull, n) {
  return {hp: pull.T / n, dps: pull.L / (pull.T * (n + 1) / 2)};
}

function roleMultipliers(tags) {
  return tags.reduce(
    (acc, tag) => (ROLES[tag] ? {hp: acc.hp * ROLES[tag].hp, dps: acc.dps * ROLES[tag].dps} : acc),
    {hp: 1, dps: 1},
  );
}

function span(lo, hi) {
  return lo <= hi ? [lo, hi] : [hi, lo];
}

// Damage per second of the reference character (squishy DPS at ee = 0,
// slowed by the elevation's `a` and the profile's TTK factor), or null for an
// unknown profile or elevation.
export function referenceDps(plan, ee) {
  const profile = GEAR_PROFILES[plan];
  const elevation = ELEVATIONS[ee];
  if (!profile || !elevation) return null;
  return SQUISHY_DPS / elevation.a / profile.ttk;
}

// Seconds for the reference character to kill a unit with `maxHP`, or null.
export function referenceTimeToKill(maxHP, plan, ee) {
  const dps = referenceDps(plan, ee);
  return dps === null || typeof maxHP !== "number" ? null : maxHP / dps;
}

// The targets for a unit type's tags (assumed "open" until it's tagged
// otherwise), or {untargeted} for a group size with no targets yet. hp/dps
// are [lo, hi] (a range when the pull size spans several unit counts);
// ttd(plan, ee) is the target seconds for this unit alone to kill a
// character in that gear profile at that ee, or null.
export function unitTargets(tags = []) {
  const intendedForTag = tags.find((t) => INTENDED_FOR[t] || UNTARGETED.includes(t)) ?? "open";
  if (!INTENDED_FOR[intendedForTag]) return {untargeted: intendedForTag};
  const intendedFor = INTENDED_FOR[intendedForTag];
  const pullTag = tags.find((t) => PULLS[t]) ?? "solo";
  const pull = PULLS[pullTag];
  const role = roleMultipliers(tags);

  const soloHp = SQUISHY_DPS * intendedFor.ttk;
  const soloDps = (SQUISHY_EHP * intendedFor.hpLost) / intendedFor.ttk;
  const [few, many] = pull.n.map((n) => pullUnitMultipliers(pull, n));
  const unitDps = (m) => soloDps * m.dps * role.dps;
  const hp = span(soloHp * many.hp * role.hp, soloHp * few.hp * role.hp);

  return {
    intendedFor: intendedForTag,
    pull: pullTag,
    hp,
    dps: span(unitDps(many), unitDps(few)),
    // Seconds for the reference character in `plan` gear at `ee` to kill this
    // unit alone: [lo, hi] of the HP target over their damage. referenceDps
    // is that character's damage, from the same a-slowdown the class DPS
    // targets use.
    ttk(plan, ee) {
      const dps = referenceDps(plan, ee);
      return dps === null ? null : span(...hp.map((h) => h / dps));
    },
    ttd(plan, ee) {
      const profile = GEAR_PROFILES[plan];
      const elevation = ELEVATIONS[ee];
      if (!profile || !elevation) return null;
      const ttd = (dps) => (SQUISHY_EHP * profile.ehp) / (dps * elevation.b);
      return span(ttd(unitDps(few)), ttd(unitDps(many)));
    },
  };
}

// The unit counts the class survivability sim uses per pull size.
const SIM_PULL_UNITS = {solo: 1, pair: 2, group: 4, swarm: 6};

// Targets for one cell of the class survivability sim (a stat priority at an
// ee, against a pull from `intendedFor` content): the whole pull's TTK,
// HP lost (a fraction) and TTD (enemies never dying), or null where there's
// no target (an untargeted group size, elevation or priority name).
export function classSurvivalTarget({priority, intendedFor, pull, ee}) {
  const profile = GEAR_PROFILES[PRIORITY_PROFILES[priority]];
  const base = INTENDED_FOR[intendedFor];
  const shape = PULLS[pull];
  const elevation = ELEVATIONS[ee];
  const n = SIM_PULL_UNITS[pull];
  if (!profile || !base || !shape || !elevation || intendedFor === "g5") return null;

  const soloDps = (SQUISHY_EHP * base.hpLost) / base.ttk;
  const unitDps = (soloDps * shape.L) / ((shape.T * (n + 1)) / 2);
  return {
    ttk: base.ttk * shape.T * profile.ttk * elevation.a,
    hpLost: (base.hpLost * shape.L * elevation.a * elevation.b * profile.ttk) / profile.ehp,
    ttd: (SQUISHY_EHP * profile.ehp) / (n * unitDps * elevation.b),
  };
}

// How a survivability cell (see Build::ClassTtdSimsController) fits its
// target, per metric: "on"/"near"/"off" like targetFit, or "tanky" for a
// character that outlasts the sim's cap where that isn't the goal.
export function classSurvivalFit(cell, target) {
  if (!target) return {ttd: null, hpLost: null};
  const sustains = SUSTAINING_PRIORITIES.includes(cell.priority) && cell.elevation === 0;
  let ttdFit;
  if (cell.survives) {
    ttdFit = sustains ? "on" : "tanky";
  } else {
    ttdFit = targetFit(cell.ttd, [target.ttd, target.ttd]);
  }
  return {ttd: ttdFit, hpLost: targetFit(cell.hpLostPct / 100, [target.hpLost, target.hpLost])};
}

// Target sustained DPS for a class in one stat priority's gear at ee, or null
// where there's no target: slowed by that gear profile's TTK factor (tanky
// DPS 1.25x, tanks and healers 1.5x a DPS's).
export function classTargetDps(ee, priority = "dps") {
  return referenceDps(PRIORITY_PROFILES[priority] ?? "offense", ee);
}

// How far actual is from target, for coloring: "on" within 10%, "near"
// within 25%, else "off".
export function targetFit(actual, [lo, hi]) {
  if (actual >= lo && actual <= hi) return "on";
  const nearest = actual < lo ? lo : hi;
  const off = Math.abs(actual - nearest) / nearest;
  if (off <= 0.1) return "on";
  return off <= 0.25 ? "near" : "off";
}
