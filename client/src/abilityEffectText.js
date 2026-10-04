import {
  effectSchool,
  hastePct,
  amountBonus,
  timeBudget,
  hastedSeconds,
} from "./abilityStats";
import {humanize} from "./abilityEditor/abilityFormatting";

const TARGETS = {
  bTarget: "the target",
  gTarget: "a friendly target",
  bAll: "all enemies in range",
  gAll: "all allies in range",
  self: "self",
  target: "the target",
};

function num(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function span(amount) {
  const [lo, hi] = Array.isArray(amount) ? amount : [amount, amount];
  return [lo, hi];
}

// Rounds each end of an authored amount after adding the stat bonus.
// scale is the server's amount_scale: authored amounts grow with the
// player's primary stat (see command.AuthoredAmountScale); the bonus doesn't.
function amountText(amount, bonus, scale = 1) {
  const [lo, hi] = span(amount);
  const a = Math.round(lo * scale + bonus);
  const b = Math.round(hi * scale + bonus);
  return a === b ? String(a) : `${a}-${b}`;
}

function amountScale(combatStats) {
  return combatStats?.amount_scale ?? 1;
}

function rangeText(range) {
  if (range === undefined || range === null) return "";
  const max = Array.isArray(range) ? range[1] : range;
  return ` (range ${num(max)})`;
}

export function abilitySchool(ability) {
  const schools = (ability.effects || []).map(effectSchool);
  return schools.includes("magic") ? "magic" : "physical";
}

export function abilityHastePct(ability, combatStats) {
  return hastePct(combatStats, abilitySchool(ability));
}

function statusEffectLines(status, ctx) {
  const lines = [];
  for (const effect of status.effects || []) {
    if (effect.type === "stat") {
      const verb = effect.modifierType === "multiply" ? `x${num(effect.amount)}` : `${effect.amount >= 0 ? "+" : ""}${num(effect.amount)}`;
      lines.push(`${humanize(effect.statName)} ${verb}`);
    } else if (effect.type === "recurring") {
      const heal = effect.onTick === "heal";
      const school = effectSchool(effect);
      const bonus = amountBonus({...ctx, school, budget: effect.tickRate, isHeal: heal, isRecurring: true});
      const every = hastedSeconds(effect.tickRate, hastePct(ctx.combatStats, school));
      const amount = amountText(effect.amount, bonus, amountScale(ctx.combatStats));
      lines.push(heal ? `Heals ${amount} every ${num(every)}s` : `Deals ${school} damage: ${amount} every ${num(every)}s`);
    } else if (effect.type === "triggered") {
      lines.push(`Triggered effect (${humanize(effect.trigger?.type || "trigger")})`);
    }
  }
  return lines;
}

function effectLine(effect, ability, ctx) {
  const who = TARGETS[effect.affects] || effect.affects;
  const budget = timeBudget(ability);
  switch (effect.type) {
    case "harm": {
      const school = effectSchool(effect);
      const bonus = amountBonus({...ctx, school, budget});
      return [`Deals ${amountText(effect.amount, bonus, amountScale(ctx.combatStats))} ${school} damage to ${who}${rangeText(effect.range)}`];
    }
    case "heal": {
      const bonus = amountBonus({...ctx, school: "magic", budget, isHeal: true});
      return [`Heals ${who} for ${amountText(effect.amount, bonus, amountScale(ctx.combatStats))}${rangeText(effect.range)}`];
    }
    case "resource": {
      const verb = effect.delta >= 0 ? "Restores" : "Drains";
      return [`${verb} ${num(Math.abs(effect.delta))} ${effect.resourceName} on ${who}`];
    }
    case "status": {
      const status = effect.status || {};
      const kind = status.treatAs ? ` (${status.treatAs})` : "";
      const head = `Applies ${status.name}${kind} to ${who} for ${num(effect.duration)}s`;
      return [head, ...statusEffectLines(status, {...ctx}).map((l) => `  ${l}`)];
    }
    default:
      return [];
  }
}

// One entry per effect, each a list of lines (first is the effect itself,
// any further ones are indented status details).
export function describeEffects(ability, {combatStats}) {
  const ctx = {combatStats};
  return (ability.effects || []).map((effect) => effectLine(effect, ability, ctx));
}

export function hastedCastTime(ability, combatStats) {
  if (!(ability.castTime > 0)) return null;
  return hastedSeconds(ability.castTime, abilityHastePct(ability, combatStats));
}

// Haste shrinks the GCD down to a 1s floor; an authored GCD already under 1s
// is left alone. Mirrors the server's HastedGlobalCooldownSeconds.
export function hastedGlobalCooldown(ability, combatStats) {
  const gcd = ability.globalCooldown ?? 0;
  if (gcd <= 1) return gcd;
  return Math.max(hastedSeconds(gcd, abilityHastePct(ability, combatStats)), 1);
}
