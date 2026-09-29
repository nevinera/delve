// A server-shaped combat_stats payload (see game-server messages.go's
// combatStatsJSON); pass only the parts a test cares about.
export function combatStats({stats = {}, physical = {}, magic = {}, basicAttack = {}} = {}) {
  const school = (o) => ({haste_pct: 0, crit_chance_pct: 5, stat_contribution: 0, ...o});
  return {stats, physical: school(physical), magic: school(magic), basic_attack: school(basicAttack)};
}
