// A place's population plan: its `population` annotation (see
// docs/population.md), one `key: value` per line, which the placer applies.
// Pure.

// Encounters per 1000 square feet of open ground.
export const DENSITIES = {none: 0, sparse: 0.25, normal: 0.5, dense: 1, packed: 1.5};
const HOSTILITIES = ["hostile", "neutral", "friendly"];
const DEFAULT_WANDER = 10;

// {plan, errors}: plan is {density, mix: [{unitType, weight, hostility?}], groups: [min,
// max], movement, hostility, bosses: [{unitType, movement}], ncus:
// [{identifier, name, tokenImageUrl, greeting, movement}]}, with defaults
// filled in; errors are strings, one per bad line.
export function parsePopulation(text) {
  const plan = {density: 0, mix: [], groups: [1, 1], movement: {type: "wander", radius: DEFAULT_WANDER}, hostility: "hostile", bosses: [], ncus: []};
  const errors = [];
  const lines = String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-z]+)\s*:\s*(.*)$/);
    if (!match) {
      errors.push(`"${line}": lines are key: value`);
      continue;
    }
    const [, key, value] = match;
    const error = PARSERS[key] ? PARSERS[key](value, plan) : `unknown key ${key} (known: ${Object.keys(PARSERS).join(", ")})`;
    if (error) errors.push(`${key}: ${error}`);
  }
  if (plan.density > 0 && !plan.mix.length) errors.push("density without a mix: say which unit types");
  return {plan, errors};
}

const PARSERS = {
  density(value, plan) {
    if (value in DENSITIES) plan.density = DENSITIES[value];
    else if (/^\d+(\.\d+)?$/.test(value)) plan.density = Number(value);
    else return `${value} isn't ${Object.keys(DENSITIES).join(", ")} or a number (encounters per 1000 sq ft)`;
  },
  mix(value, plan) {
    for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
      const m = part.match(/^([a-z0-9][a-z0-9_-]*)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(hostile|neutral|friendly))?$/);
      if (!m) return `"${part}" isn't a unit type, an optional weight and an optional hostility`;
      plan.mix.push({unitType: m[1], weight: m[2] ? Number(m[2]) : 1, ...(m[3] ? {hostility: m[3]} : {})});
    }
  },
  groups(value, plan) {
    const m = value.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    const [min, max] = m ? [Number(m[1]), Number(m[2] ?? m[1])] : [];
    if (!m || min < 1 || max < min || max > 8) return `${value} isn't a size or range, 1 to 8`;
    plan.groups = [min, max];
  },
  movement(value, plan) {
    const movement = parseMovement(value);
    if (typeof movement === "string") return movement;
    plan.movement = movement;
  },
  hostility(value, plan) {
    if (!HOSTILITIES.includes(value)) return `${value} isn't ${HOSTILITIES.join(", ")}`;
    plan.hostility = value;
  },
  boss(value, plan) {
    const m = value.match(/^([a-z0-9][a-z0-9_-]*)(?:\s+(.+))?$/);
    if (!m) return `${value} isn't a unit type and an optional movement`;
    const movement = m[2] ? parseMovement(m[2]) : {type: "wander", radius: 5};
    if (typeof movement === "string") return movement;
    plan.bosses.push({unitType: m[1], movement});
  },
  ncu(value, plan) {
    // identifier "Name" tokenImageUrl ["greeting"] [movement]
    const m = value.match(/^([a-z0-9][a-z0-9_-]*)\s+"([^"]+)"\s+(\S+)(?:\s+"([^"]*)")?(?:\s+(.+))?$/);
    if (!m) return `${value} isn't: identifier "Name" tokenImageUrl ["greeting"] [movement]`;
    const movement = m[5] ? parseMovement(m[5]) : {type: "still"};
    if (typeof movement === "string") return movement;
    plan.ncus.push({identifier: m[1], name: m[2], tokenImageUrl: m[3], greeting: m[4] || null, movement});
  },
};

// still | patrol | wander [radius]; an error string if it's none of them.
function parseMovement(value) {
  const m = value.match(/^(still|patrol|wander)(?:\s+(\d+(?:\.\d+)?))?$/);
  if (!m || (m[2] && m[1] !== "wander")) return `${value} isn't still, patrol or wander [radius]`;
  return m[1] === "wander" ? {type: "wander", radius: m[2] ? Number(m[2]) : DEFAULT_WANDER} : {type: m[1]};
}
