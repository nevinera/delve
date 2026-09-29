// Applies the server's combat_stats (game-server instancestate.CombatStats)
// to an ability's displayed numbers. The server owns every stat calculation
// (gear, buffs, elevation); this only turns its per-school Haste% and stat
// contribution into text-ready amounts. Crit is deliberately not shown.

export const STAT_DIVISOR = 90;

const NO_STATS = {haste_pct: 0, crit_chance_pct: 0, stat_contribution: 0};

// Heals are always magic, whatever the effect's own school says.
export function effectSchool(effect) {
  if (effect.type === "heal" || effect.onTick === "heal") return "magic";
  return effect.school === "magic" ? "magic" : "physical";
}

function schoolStats(combatStats, school) {
  return (school === "magic" ? combatStats?.magic : combatStats?.physical) ?? NO_STATS;
}

export function hastePct(combatStats, school) {
  return schoolStats(combatStats, school).haste_pct;
}

export function statContribution(combatStats, school) {
  return schoolStats(combatStats, school).stat_contribution;
}

export function timeBudget(ability) {
  return ability.castTime > 0 ? ability.castTime : ability.globalCooldown;
}

export function hastedSeconds(seconds, pct) {
  return seconds / (1 + pct / 100);
}

// The bonus added to an authored amount: heals double it, recurring ticks
// double it again. budget is the time budget the bonus is normalized against.
export function amountBonus({combatStats, school, budget, isHeal = false, isRecurring = false}) {
  let bonus = (statContribution(combatStats, school) / STAT_DIVISOR) * budget;
  if (isHeal) bonus *= 2;
  if (isRecurring) bonus *= 2;
  return bonus;
}
