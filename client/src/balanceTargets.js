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

// solo-pull, squishy, ee = 0. g5's are the single-character equivalent of
// its party targets (see combat_balance.md's "g5 enemies").
const AUDIENCES = {
  open: {ttk: 12, hpLost: 0.2},
  g1: {ttk: 30, hpLost: 0.65},
  g5: {ttk: 68.75, hpLost: 10},
};
const UNTARGETED_AUDIENCES = ["g2", "g3", "g10"];

// Keyed by the unit-type estimate's gearing plans.
export const GEAR_PROFILES = {
  offense: {label: "squishy", ttk: 1, ehp: 1},
  offenseWithDefense: {label: "tanky DPS", ttk: 1.25, ehp: 2},
  defense: {label: "tank", ttk: 1.5, ehp: 3},
};

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

// The targets for a unit type's tags (assumed "open" until it's tagged
// otherwise), or {untargeted} for a group size with no targets yet. hp/dps
// are [lo, hi] (a range when the pull size spans several unit counts);
// ttd(plan, ee) is the target seconds for this unit alone to kill a
// character in that gear profile at that ee, or null.
export function unitTargets(tags = []) {
  const audienceTag = tags.find((t) => AUDIENCES[t] || UNTARGETED_AUDIENCES.includes(t)) ?? "open";
  if (!AUDIENCES[audienceTag]) return {untargeted: audienceTag};
  const audience = AUDIENCES[audienceTag];
  const pullTag = tags.find((t) => PULLS[t]) ?? "solo";
  const pull = PULLS[pullTag];
  const role = roleMultipliers(tags);

  const soloHp = SQUISHY_DPS * audience.ttk;
  const soloDps = (SQUISHY_EHP * audience.hpLost) / audience.ttk;
  const [few, many] = pull.n.map((n) => pullUnitMultipliers(pull, n));
  const unitDps = (m) => soloDps * m.dps * role.dps;

  return {
    audience: audienceTag,
    pull: pullTag,
    hp: span(soloHp * many.hp * role.hp, soloHp * few.hp * role.hp),
    dps: span(unitDps(many), unitDps(few)),
    ttd(plan, ee) {
      const profile = GEAR_PROFILES[plan];
      const elevation = ELEVATIONS[ee];
      if (!profile || !elevation) return null;
      const ttd = (dps) => (SQUISHY_EHP * profile.ehp) / (dps * elevation.b);
      return span(ttd(unitDps(few)), ttd(unitDps(many)));
    },
  };
}

// Target sustained DPS for a class at ee, or null where there's no target.
// Tanks and healers hold back: their TTK is 1.5x a DPS's.
export function classTargetDps(ee, role = "dps") {
  const elevation = ELEVATIONS[ee];
  if (!elevation) return null;
  return (SQUISHY_DPS / elevation.a) / (role === "dps" ? 1 : 1.5);
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
