// "+ Encounter": builds a balanced pull from the map's unit palette and lays
// it out around a clicked point (see docs/combat_balance.md's Pull size).
//
// A pull is a budget of points, each pull-size tag worth twice the one
// below it: two swarm units stand in for one group unit, two group for one
// pair, two pair for one solo. The chosen size sets the budget (3-4 group
// units = 6-8 points) and only units of that size or smaller fill it.

export const INTENDED_FOR = ["open", "g1", "g2", "g3", "g5", "g10"];
export const PULL_SIZES = ["solo", "pair", "group", "swarm"];

const WEIGHT = {swarm: 1, group: 2, pair: 4, solo: 8};
const BUDGET = {solo: [8, 8], pair: [8, 8], group: [6, 8], swarm: [5, 8]};
// How often a slot is filled from the chosen size itself (when it fits)
// rather than a smaller one, so a "pair" encounter usually looks like a pair.
const OWN_SIZE_CHANCE = 0.75;
const ATTEMPTS = 60;

function pullSizeOf(tags) {
  return PULL_SIZES.find((size) => tags.includes(size)) ?? null;
}

function damageTypeOf(tags) {
  return ["melee", "ranged", "caster"].find((type) => tags.includes(type)) ?? null;
}

// At most one of each per encounter: a healer, a buffer, and a leader
// (tough + buffs, e.g. a goblin boss).
function roleCaps(tags) {
  const caps = [];
  if (tags.includes("healer")) caps.push("healer");
  if (tags.includes("buffs")) caps.push("buffs");
  if (tags.includes("tough") && tags.includes("buffs")) caps.push("leader");
  return caps;
}

function randomInt([min, max], random) {
  return min + Math.floor(random() * (max - min + 1));
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

// candidates: [{key, tags}]. Returns {keys} (one entry per unit to place)
// or {error} explaining why nothing fits.
export function buildEncounter({candidates, intendedFor, pullSize, random = Math.random}) {
  const ownWeight = WEIGHT[pullSize];
  const eligible = candidates
    .map((c) => ({...c, size: pullSizeOf(c.tags ?? [])}))
    .filter((c) => (c.tags ?? []).includes(intendedFor) && c.size && WEIGHT[c.size] <= ownWeight)
    .map((c) => ({...c, weight: WEIGHT[c.size], damage: damageTypeOf(c.tags), caps: roleCaps(c.tags)}));
  if (eligible.length === 0) return {error: `No ${intendedFor} unit types of ${pullSize} size or smaller to choose from.`};

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const keys = fill(eligible, ownWeight, randomInt(BUDGET[pullSize], random), random);
    if (keys === null) continue;
    const picked = keys.map((key) => eligible.find((c) => c.key === key));
    if (picked.length > 1 && !picked.some((c) => c.damage === "melee")) continue;
    return {keys};
  }
  const hasMelee = eligible.some((c) => c.damage === "melee");
  return {error: hasMelee
    ? `Couldn't build a ${pullSize} encounter from these unit types.`
    : `A ${pullSize} encounter needs at least one melee unit, and none of these are.`};
}

function fill(eligible, ownWeight, budget, random) {
  const keys = [];
  const used = new Set();
  const damageTypes = new Set();
  let remaining = budget;
  while (remaining > 0) {
    const fits = eligible.filter((c) => c.weight <= remaining && c.caps.every((cap) => !used.has(cap)));
    if (fits.length === 0) break;
    const own = fits.filter((c) => c.weight === ownWeight);
    let pool = own.length && (random() < OWN_SIZE_CHANCE || own.length === fits.length) ? own : fits.filter((c) => c.weight < ownWeight);
    if (pool.length === 0) pool = fits;
    // Prefer a damage type the pull doesn't have yet, for a mix of melee
    // and ranged or caster units.
    const fresh = pool.filter((c) => !damageTypes.has(c.damage));
    const choice = pick(fresh.length && random() < 0.7 ? fresh : pool, random);
    keys.push(choice.key);
    choice.caps.forEach((cap) => used.add(cap));
    damageTypes.add(choice.damage);
    remaining -= choice.weight;
  }
  return keys.length ? keys : null;
}

const CLUSTER_RADIUS = 10;
const GAP = 0.5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Spreads units evenly around center (feet): a sunflower spiral within
// CLUSTER_RADIUS feet, widened only as far as the tokens need to not
// overlap. Each faces a random direction. radii: each unit's token radius.
export function scatterPositions(center, radii, random = Math.random) {
  const n = radii.length;
  if (n === 0) return [];
  const maxRadius = Math.max(...radii);
  if (n === 1) return [{x: center.x, y: center.y, angle: Math.round(random() * 360)}];
  // Neighbours on a sunflower spiral r = c*sqrt(i) sit about 1.77c apart.
  const minSpacing = (2 * maxRadius + GAP) / 1.77;
  const fitSpacing = Math.max(0, CLUSTER_RADIUS - maxRadius) / Math.sqrt(n - 0.5);
  const c = Math.max(minSpacing, fitSpacing);
  const turn = random() * Math.PI * 2;
  return radii.map((_, i) => {
    const r = c * Math.sqrt(i + 0.5);
    const theta = turn + i * GOLDEN_ANGLE;
    return {
      x: round(center.x + r * Math.cos(theta)),
      y: round(center.y + r * Math.sin(theta)),
      angle: Math.round(random() * 360),
    };
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
