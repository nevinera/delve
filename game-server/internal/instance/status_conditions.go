package instance

import (
	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// refreshStatusEffectConditions re-evaluates every active status effect's
// StatusEffectCondition (see command.ConditionMet) against this tick's
// state, caching the result in ActiveStatusEffect.ConditionsMet. Runs once
// per tick, before anything else this tick reads ConditionsMet (stat math
// via command.ActiveStatModifiers, recurring-tick firing in
// tickStatusEffects) - conditions are therefore current as of the *start*
// of this tick, not continuously re-evaluated as combat unfolds within it,
// the same tick-granularity tradeoff the rest of this engine already makes
// (health/resource regen, cast resolution, etc.).
//
// This is the one place in the real engine that resolves "who is the
// applier" / "who is the holder's target" against the full unit map -
// every downstream consumer of ConditionsMet just reads the cached bool,
// so none of them need instance-state access at all.
func refreshStatusEffectConditions(state *instancestate.InstanceState) {
	for _, unit := range state.Units {
		var target *instancestate.UnitState
		if unit.Target != nil {
			target = state.Units[*unit.Target]
		}
		for i := range unit.ActiveStatusEffects {
			e := &unit.ActiveStatusEffects[i]
			applier := state.Units[e.ApplierID]
			if len(e.ConditionsMet) != len(e.Status.Effects) {
				e.ConditionsMet = make([]bool, len(e.Status.Effects))
			}
			for j, eff := range e.Status.Effects {
				e.ConditionsMet[j] = command.ConditionMet(unit, applier, target, eff.Condition)
			}
		}
	}
}
