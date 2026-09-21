// Package dpssim simulates an NPC UnitType's damage output against a
// stationary, always-in-range, always-facing target with a fixed stat
// profile (a "target dummy"), over a fixed wall-clock duration - see
// docs/combat_balance.md for why enemy DPS needs pinning down at all, and
// issue #72 for the calculator this package backs.
//
// The combat math mirrors internal/command's formulas (IncomingDamage,
// PowerEffectAmount/effectAmount, RollAttackOutcome, RecurringTickInterval)
// and internal/instance's NPC attack logic (unit_behavior.go's
// tryNPCBasicAttack/tryNPCAttack, status_effects.go's
// tickStatusEffects/fireStatusTick) as closely as possible, simplified
// where an NPC attacker's own stats are involved: NPCs carry no
// EquippedItems, so every attacker-side stat contribution (Haste%, the
// stat-scaled bonus in effectAmount, and the Strength/Agility/Intellect
// terms in critChancePct) is always 0 - collapsing critChancePct to a flat
// 5% and Haste% to 0% for every NPC attacker, regardless of formula
// branch or school. Keep this package in sync if that math changes.
//
// Deliberately unimplemented, matching the real engine today (confirmed by
// grep - neither is consulted anywhere in internal/instance or
// internal/command):
//
//   - UnitType.Tactics: real NPCs pick a uniformly random usable power once
//     off GCD, ignoring Tactics.Type entirely (see tryNPCAttack). pickPower
//     below does the same. Tactics-driven (rotation/priorityRotation/
//     scripted/phased) selection would replace pickPower once the real
//     engine implements it.
//   - StatusEffect{Type: "stat"}: stat-modifying buffs/debuffs (e.g. a
//     self-haste enrage) are schema-only too - never read anywhere. Only
//     "recurring" StatusEffects are simulated, matching what
//     tickStatusEffects actually does.
//
// Power.CostType/CostAmount and UnitType.Resource.ReturnRate/DefaultValue
// are modeled too, mirroring the real engine's command.PowerUsable/
// ClampResource and instance.tickResourceRegen: pickPower only picks among
// powers the enemy can currently afford, a successful cast spends
// CostAmount, a "resource" effect applies its own delta, and resource
// regenerates continuously toward DefaultValue at ReturnRate (see
// resource.go). Unlike the real tick loop, which only checks every 100ms,
// Simulate's event loop can afford to poll on the same cadence
// (resourceRetryInterval) purely to decide when to retry a momentarily
// unaffordable power - the regen itself is computed continuously from
// elapsed time, not quantized to that interval.
//
// Also out of scope, by the nature of a target dummy rather than a real
// fight: range/line-of-sight/facing-arc checks (the target is always in
// range and frontal), and target death (the dummy has infinite effective
// health for the duration of the run - MaxHealth is only used to derive
// Result.TTD as a convenience, dividing it by the simulated DPS rather than
// tracking a health pool that could hit zero mid-run).
package dpssim
