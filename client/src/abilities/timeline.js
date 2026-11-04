import { SCHOOL_COLORS } from "./stock.js";

// What happens when an ability's used, in order, for anything that plays one: a pure list of events
// worked out from the ability and how far off its target is. The game server decides what an
// ability does; this is only what it looks and sounds like.
//
// An event is { at, kind, ... }, at in seconds from when it's used:
// - clip: { role, loop }, a role of animations.js's ROLES, or "channel" to hold a spell. A melee
//   ability's cast holds "windup" instead, and lets go into "released".
// - bar: { until, label }, the cast or channel bar.
// - visual: { effect, on, colors, scale, params, heldByCast }, a stock visual on "caster", "target" or
//   "ground". heldByCast: it lasts until the cast or channel ends, and stops if that's cut short.
// - sound: { sound, volume, pitch }.
// - projectile: { effect, colors, until, trails }, flying from the caster to the target, with
//   trails, the visuals with `when: "flight"`, following it.
// - hit: { effect, n, on }, one of the ability's effects landing, on tick n of a channel.
// - area: { shape, radius, cone, around, colors }, what an area effect covers.

const MELEE_STRIKE_S = 0.3; // how far into its attack clip a melee hit lands
export const MELEE_FT = 5; // how far off a melee target stands
const DEFAULT_SPEED = 60; // a charge's, in feet a second
const AFTER_S = 1.2; // how long the scene carries on after the last thing happens

// Where a visual or sound goes if it doesn't say: impacts on the target, the rest on the caster.
const defaultOn = (when, ability) => (when !== "impact" ? "caster" : ability.target === "ground" ? "ground" : ability.target === "self" || ability.target === "none" ? "caster" : "target");

export const schoolColors = (ability) => SCHOOL_COLORS[ability.school ?? ability.schools?.[0]] ?? SCHOOL_COLORS.physical;

// The nearest clip a body has for each `animation`. Those with none of their own wait on more clips.
const ANIMATION_ROLES = {
  attack: "attack", offhandAttack: "attack", dualAttack: "attack", stab: "attack", kick: "attack", spinningKick: "attack", punch: "attack",
  bigAttack: "bigAttack", spinningAttack: "bigAttack", shieldBash: "bigAttack", groundSlam: "bigAttack",
  shoot: "shoot", aimedShot: "shoot", rapidShot: "shoot", throw: "shoot",
  cast: "cast", castBig: "cast", castChannel: "cast", castGround: "cast", castOverhead: "cast", castSelf: "cast", castOnAlly: "cast", pray: "pray", drink: "cast", transform: "cast", roll: "cast",
  shout: "battleCry", breath: "breath",
};

// Which clip it plays as it's let go, or null for none: what its `animation` says, or else a melee
// attack, a shot if it's physical with a ranged weapon in hand, or a spell.
export function releaseRole(ability, ranged) {
  if (ability.animation === "none") return null;
  if (ANIMATION_ROLES[ability.animation]) return ANIMATION_ROLES[ability.animation];
  if (ability.range === "melee") return "attack";
  if (ability.school === "physical" || !ability.school) return ranged ? "shoot" : "cast";
  return "cast";
}

// The effects that land when a projectile arrives, and those that land when it's let go.
const onArrival = (effect, ability) => ability.speed && effect.affects === "target" && ["enemy", "ally", "any"].includes(ability.target);

export function abilityTimeline(ability, { distance = MELEE_FT, ranged = false } = {}) {
  const events = [];
  const castTime = ability.castTime ?? 0;
  const channel = ability.channel?.duration > 0 ? ability.channel : null;
  const ticks = channel ? Math.max(1, channel.ticks ?? 1) : 0;
  const melee = ability.range === "melee";
  const launch = castTime;
  const strike = melee ? launch + MELEE_STRIKE_S : launch;
  const flight = ability.speed ? distance / ability.speed : 0;
  const impact = strike + flight;
  const end = channel ? launch + channel.duration : impact;
  const castEnds = channel ? end : launch;

  if (castTime > 0) {
    events.push({ at: 0, kind: "clip", role: melee ? "windup" : "channel", loop: true });
    events.push({ at: 0, kind: "bar", until: castTime, label: ability.name, draining: false });
  }
  if (channel) {
    events.push({ at: launch, kind: "clip", role: "channel", loop: true });
    events.push({ at: launch, kind: "bar", until: end, label: ability.name, draining: true });
  } else {
    const role = releaseRole(ability, ranged);
    if (role) events.push({ at: launch, kind: "clip", role: melee && castTime > 0 && ["attack", "bigAttack"].includes(role) ? "released" : role });
  }

  // When a visual or sound with this `when` happens.
  const times = (when) => {
    if (when === "cast") return [0];
    if (when === "launch") return [launch];
    if (when === "flight") return [];
    if (when === "channel") return channel ? Array.from({ length: ticks }, (_, n) => launch + ((n + 1) * channel.duration) / ticks) : [];
    return channel ? Array.from({ length: ticks }, (_, n) => launch + ((n + 1) * channel.duration) / ticks) : [impact];
  };

  const colorsOf = (entry) => (entry.colors?.length === 2 ? entry.colors : schoolColors(ability));
  const isProjectile = (v) => ability.speed && v.when === "launch" && ["bolt", "arrow"].includes(v.effect);
  const visuals = ability.visuals ?? [];
  for (const v of visuals) {
    if (isProjectile(v)) continue;
    for (const at of times(v.when)) {
      const heldByCast = v.duration === "cast";
      const params = heldByCast ? { ...v, duration: Math.max(0, castEnds - at) } : v;
      events.push({ at, kind: "visual", effect: v.effect, on: v.on ?? defaultOn(v.when, ability), colors: colorsOf(v), scale: v.scale ?? 1, params, heldByCast });
    }
  }
  for (const s of ability.sounds ?? []) {
    for (const at of times(s.when)) events.push({ at, kind: "sound", sound: s.sound, on: s.on ?? defaultOn(s.when, ability), volume: s.volume ?? 1, pitch: s.pitch ?? 1 });
  }
  if (ability.speed && ["enemy", "ally", "any"].includes(ability.target)) {
    const own = visuals.find(isProjectile);
    events.push({ at: launch, kind: "projectile", effect: own?.effect ?? "bolt", colors: own ? colorsOf(own) : schoolColors(ability), scale: own?.scale ?? 1, params: own?.duration === "cast" ? { ...own, duration: undefined } : own, until: impact, trails: visuals.filter((v) => v.when === "flight").map((v) => ({ effect: v.effect, colors: colorsOf(v), params: v.duration === "cast" ? { ...v, duration: undefined } : v })) });
  }

  (ability.effects ?? []).forEach((effect) => {
    const beats = channel ? times("channel") : [onArrival(effect, ability) ? impact : effect.type === "move" && effect.kind === "charge" ? launch : strike];
    beats.forEach((at, n) => {
      events.push({ at, kind: "hit", effect, n });
      if (["enemies", "allies"].includes(effect.affects) && effect.radius) {
        events.push({ at, kind: "area", radius: effect.radius, cone: effect.cone ?? null, around: effect.around ?? "self", colors: schoolColors(ability) });
      }
    });
    if (effect.type === "move" && effect.kind === "charge") {
      const travel = Math.max(0, distance - MELEE_FT) / (effect.speed ?? DEFAULT_SPEED);
      events.push({ at: launch, kind: "clip", role: "run", loop: true });
      events.push({ at: launch + travel, kind: "clip", role: "attack" });
    }
  });

  events.sort((a, b) => a.at - b.at);
  const last = events.reduce((most, e) => Math.max(most, e.at, e.until ?? 0), end);
  return { events, duration: last + AFTER_S };
}

// What a move effect does to where things stand, t seconds after it lands: { caster, target }, each
// [ft along the line from the caster to the target, ft up], or missing where it doesn't move.
export function moveAt(effect, t, distance) {
  if (t < 0) return {};
  const ease = (u) => Math.min(1, Math.max(0, u));
  switch (effect.kind) {
    case "charge": {
      const span = Math.max(0, distance - MELEE_FT);
      return { caster: [Math.min(span, t * (effect.speed ?? DEFAULT_SPEED)), 0] };
    }
    case "leap": {
      const u = ease(t / 0.8);
      return { caster: [Math.max(0, distance - MELEE_FT) * u, (effect.height ?? 8) * 4 * u * (1 - u)] };
    }
    case "blink":
      return { caster: [Math.min(effect.distance ?? 20, distance - MELEE_FT), 0] };
    case "knockback": {
      const u = ease(t / 0.6);
      return { target: [(effect.distance ?? 15) * u, (effect.height ?? 4) * 4 * u * (1 - u)] };
    }
    case "pull": {
      const u = ease(t / 0.4);
      return { target: [-Math.max(0, distance - MELEE_FT) * u, 0] };
    }
    default:
      return {};
  }
}

// What an amount reads as, for showing: "120", "80-120", "120 + 1.1 × spell power".
export function amountText(amount) {
  if (amount === undefined || amount === null) return "";
  const base = (b) => (Array.isArray(b) ? `${b[0]}-${b[1]}` : String(b));
  if (typeof amount === "number" || Array.isArray(amount)) return base(amount);
  const parts = [];
  if (amount.base !== undefined) parts.push(base(amount.base));
  const names = { attackPower: "attack power", spellPower: "spell power", weapon: "weapon", mastery: "mastery", maxHealth: "max health", shareOfTrigger: "what set it off" };
  for (const [key, name] of Object.entries(names)) if (amount[key] !== undefined) parts.push(`${amount[key]} × ${name}`);
  if (amount.perSpent !== undefined) parts.push(`${amountText(amount.perSpent)} per point`);
  if (amount.byMastery !== undefined) return `(${parts.join(" + ")}) grown by ${amount.byMastery}% per mastery`;
  return parts.join(" + ");
}

// What to float over the unit an effect lands on, or null.
export function hitText(effect, statuses = []) {
  switch (effect.type) {
    case "damage":
      return amountText(effect.amount) || "damage";
    case "heal":
      return `+${amountText(effect.amount) || "heal"}`;
    case "resource":
      return `+${amountText(effect.amount)} ${effect.resource ?? ""}`.trim();
    case "status":
      return statuses.find((s) => s.id === effect.status)?.name ?? "status";
    case "interrupt":
      return "interrupted";
    case "taunt":
      return "taunted";
    case "dispel":
      return "dispelled";
    case "resurrect":
      return "resurrected";
    default:
      return null;
  }
}

// Which unit an effect lands on: "caster" or "target".
export const hitOn = (effect, ability) => (effect.affects === "self" || ability.target === "self" ? "caster" : effect.affects === "allies" && (effect.around ?? "self") === "self" ? "caster" : "target");
