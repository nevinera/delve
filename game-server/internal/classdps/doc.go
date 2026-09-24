// Package classdps simulates a CharacterClass's damage output, run through
// a chosen rotation ("strategy") and a mocked equipment kit, against a
// stationary, always-in-range target dummy with effectively infinite
// health - see issue #75 for the calculator this backs, and
// docs/combat_balance.md for the D=25 sustained-DPS target it exists to
// check classes against.
//
// Unlike internal/dpssim (the enemy DPS calculator, issue #72), which
// deliberately re-derives a simplified mirror of the real combat math (an
// NPC attacker is simple: no gear, no resource depth, no stat effects at
// the time it was written), this package calls the real
// internal/command math directly - UnitCombatStats, PowerUsable,
// PowerEffectAmount, IncomingDamage, AdjustResource, ApplyDamageDoneBonus,
// HealingTakenPct, ApplyStatus, RecurringTickInterval, and
// BasicAttackDamage/PlayerBasicAttackInterval (both exported specifically
// for this reuse). A simulated player's combat model - multi-resource
// costs, Tier 1/Tier 2 stat effects, Avoidance/Mitigation,
// damageDone/damageTaken/healingTaken scaling - is now complex and
// actively changing enough that a second hand-derived copy would be an
// ongoing drift risk. The one thing that can't be reused as-is is
// UsePowerHandler/BasicAttackHandler themselves (they call time.Now()
// internally rather than taking an injectable clock), so this package's
// event loop is still its own - it just calls into real formulas instead
// of re-deriving them.
//
// The event loop is fixed-dt (10ms, see Simulate), not event-driven like
// dpssim's "jump to the next relevant time" - simpler and lower-risk to
// get right, at the cost of a small (sub-1%, at this step size) stepping
// error against a true event-driven simulation. Worth revisiting if either
// precision or performance ever actually matters more than they do today.
//
// A CharacterClass has no UnitType.Tactics - a real player picks their own
// rotation - so power selection here is driven by an explicit Strategy the
// caller supplies (see strategy.go), not anything read off the class
// itself.
//
// The target is a fixed, zero-stat dummy, not spread across gearing plans
// the way internal/dpsspread spreads the *target* for the enemy
// calculator - real NPCs carry no EquippedItems, so Avoidance/Mitigation
// against one are always 0 (docs/stats.md), leaving nothing meaningful to
// vary on the defending side. The attacker's own gear/elevation is what
// varies instead (see the Trainee Gear synthesis and spread layers built
// on top of this package).
//
// # Known gaps
//
// Simulate never damages the simulated character (unit) itself - only
// target's Health moves, over the course of a run. Both StatusEffectCondition
// (nevinera/delve#62) and StatusTrigger (nevinera/delve#64) read live
// unit state, so anything gated on unit's own HP or on unit taking damage
// only ever evaluates correctly when it's *target* holding the
// condition/trigger (a debuff), never when unit holds it (a self-buff):
//
//   - selfHealthPct/targetHealthPct conditions and healthAbove/healthBelow/
//     takesDamage triggers on a status unit applies to itself: never hold,
//     since unit.Health is set once (to MaxHealth) and never touched again.
//   - The same conditions/triggers on a status applied to target: work
//     correctly, since target.Health does move from unit's own attacks.
//   - dealsDamage triggers: work for either side that can actually deal
//     damage (unit, via its rotation) - target never attacks, so a
//     dealsDamage trigger held by target never fires either.
package classdps
