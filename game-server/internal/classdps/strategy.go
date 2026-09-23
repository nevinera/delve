package classdps

import (
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Strategy is a priority-ordered list of the class's own power names - the
// highest-priority entry that's currently usable (see command.PowerUsable)
// fires each check; basic attack fires when nothing in the list is usable.
// Mirrors #103's priorityRotation tactics - a player picks their own
// rotation, there's no UnitType.Tactics for a CharacterClass to consult.
type Strategy []string

// selectPower returns the highest-priority power in strategy that's both a
// shape this simulation knows how to fire (hasKnownEffect) and currently
// usable (command.PowerUsable - cooldown, GCD, cost), or false if none is.
func selectPower(unit *instancestate.UnitState, strategy Strategy, powersByName map[string]instanceconfig.Power, now time.Time) (instanceconfig.Power, bool) {
	for _, name := range strategy {
		p, ok := powersByName[name]
		if !ok || !hasKnownEffect(p) {
			continue
		}
		if command.PowerUsable(unit, p, now) {
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
