package command

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ConditionMet evaluates a single StatusEffectCondition (see
// docs/schema/status.md#statuseffectcondition). holder is the unit the
// status is active on; applier is whoever cast it (nil if they've since
// left the instance); target is holder's own current target (nil if none).
// A nil condition is always met (StatusEffect.Condition being unset means
// "always live"). Callers resolve applier/target however fits their own
// data model (the real instance's full unit map vs. classdps's fixed
// attacker/dummy pair) - this function only compares already-resolved
// units, so both can share it instead of duplicating the comparison logic.
func ConditionMet(holder, applier, target *instancestate.UnitState, cond *instanceconfig.StatusEffectCondition) bool {
	if cond == nil {
		return true
	}
	switch cond.Type {
	case "hasStatus":
		return holder != nil && hasStatus(holder, cond.StatusName)
	case "selfHealthPct":
		return holder != nil && compareThreshold(healthPct(holder), cond)
	case "targetHealthPct":
		return target != nil && compareThreshold(healthPct(target), cond)
	case "casterResource":
		if applier == nil {
			return false
		}
		res, ok := applier.Resources[cond.ResourceName]
		return ok && compareThreshold(res.Current, cond)
	default:
		return false
	}
}

func hasStatus(unit *instancestate.UnitState, name string) bool {
	for _, e := range unit.ActiveStatusEffects {
		if e.Status.Name == name {
			return true
		}
	}
	return false
}

func healthPct(unit *instancestate.UnitState) float64 {
	if unit.MaxHealth <= 0 {
		return 0
	}
	return unit.Health / unit.MaxHealth * 100
}

func compareThreshold(value float64, cond *instanceconfig.StatusEffectCondition) bool {
	switch cond.Comparison {
	case "above":
		return value > cond.Threshold
	case "below":
		return value < cond.Threshold
	default:
		return false
	}
}
