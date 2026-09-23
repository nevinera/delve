package classdps

import (
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Strategy is a priority-ordered list of the class's own powers - the
// highest-priority entry that's both usable (see command.PowerUsable) and
// eligible (its Condition, if any, holds) fires each check; basic attack
// fires when nothing in the list is usable+eligible. Mirrors #103's
// priorityRotation tactics - a player picks their own rotation, there's no
// UnitType.Tactics for a CharacterClass to consult.
type Strategy []StrategyEntry

// StrategyEntry is one priority-list entry.
type StrategyEntry struct {
	Power     string
	Condition *StrategyCondition // nil = always eligible once usable
}

// StrategyCondition gates a StrategyEntry beyond plain usability - v1
// supports the status-presence checks needed for "maintain a DoT/buff"
// rotations ("if Moonfire isn't up, cast Moonfire": Type: "missingStatus",
// On: "target", Status: "Moonfire"). More condition Types are additive
// later without changing this shape.
type StrategyCondition struct {
	Type   string // "missingStatus" | "hasStatus"
	On     string // "target" | "self"
	Status string // Status.Name to check for
}

// conditionHolds reports whether cond currently holds for the simulated
// character (self) and target - nil is always eligible. An unrecognized
// Type fails closed (never eligible) rather than open, so a typo in
// authored strategy JSON shows up as "this entry never fires" in the
// resulting DPS number, not as a silently-ignored condition.
func conditionHolds(cond *StrategyCondition, self, target *instancestate.UnitState) bool {
	if cond == nil {
		return true
	}
	owner := target
	if cond.On == "self" {
		owner = self
	}
	has := hasActiveStatus(owner, cond.Status)
	switch cond.Type {
	case "hasStatus":
		return has
	case "missingStatus":
		return !has
	default:
		return false
	}
}

func hasActiveStatus(unit *instancestate.UnitState, statusName string) bool {
	for _, e := range unit.ActiveStatusEffects {
		if e.Status.Name == statusName {
			return true
		}
	}
	return false
}

// selectPower returns the highest-priority entry in strategy whose power is
// both a shape this simulation knows how to fire (hasKnownEffect),
// currently usable (command.PowerUsable - cooldown, GCD, cost), and
// eligible (conditionHolds), or false if none is.
func selectPower(unit, target *instancestate.UnitState, strategy Strategy, powersByName map[string]instanceconfig.Power, now time.Time) (instanceconfig.Power, bool) {
	for _, entry := range strategy {
		p, ok := powersByName[entry.Power]
		if !ok || !hasKnownEffect(p) {
			continue
		}
		if command.PowerUsable(unit, p, now) && conditionHolds(entry.Condition, unit, target) {
			return p, true
		}
	}
	return instanceconfig.Power{}, false
}

// hasKnownEffect mirrors dpssim's npcEffectUsable / instance's own
// same-named helper: reports whether power has at least one effect this
// simulation knows how to fire at all.
func hasKnownEffect(power instanceconfig.Power) bool {
	for _, eff := range power.Effects {
		switch eff.Type {
		case "harm", "heal":
			if eff.Amount != nil {
				return true
			}
		case "status":
			if eff.Status != nil {
				return true
			}
		case "resource":
			if eff.ResourceName != "" {
				return true
			}
		}
	}
	return false
}
