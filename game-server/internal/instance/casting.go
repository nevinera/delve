package instance

import (
	"math/rand"
	"strings"
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickCasts resolves every unit currently mid-cast (UnitState.Casting !=
// nil, set by command.UsePowerHandler/tryNPCAttack when a power with a
// non-zero CastTime is selected):
//
//   - If the cast's target has died, the cast aborts immediately with no
//     effect and nothing charged (checked every call, not just at EndsAt).
//   - Otherwise, once now reaches Casting.EndsAt, the power's effects are
//     applied - re-validating range/LOS/target-alive at that moment (a
//     target that merely went out of range/LOS mid-cast gets another
//     chance to be back in range by completion, rather than aborting
//     early). GCD/cooldown were already committed at cast start (Handle/
//     tryNPCAttack), but the resource cost is only charged here, and only
//     if the cast actually resolved - starting a cast requires having
//     enough resources, but doesn't spend them until it completes
//     successfully (see command.SpendPowerCost).
func tickCasts(state *instancestate.InstanceState, zone instanceconfig.Zone, now time.Time, events *[]CombatEvent, rng *rand.Rand) {
	for id, unit := range state.Units {
		cast := unit.Casting
		if cast == nil {
			continue
		}

		if cast.TargetID != nil {
			target, ok := state.Units[*cast.TargetID]
			if !ok || !target.Status.IsTargetable() {
				unit.Casting = nil
				continue
			}
		}

		if now.Before(cast.EndsAt) {
			continue
		}

		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			target, ok := command.ResolveCastTarget(unit, cast.TargetID, cast.Power, state)
			if ok && command.ApplyPowerEffects(id, unit, target, cast.TargetID, cast.Power, zone, now, state, rng) {
				command.SpendPowerCost(unit, cast.Power)
			}
		} else {
			target := unit // self-only power: applyNPCPowerEffects's dist calc is a harmless 0 against itself
			targetID := id
			if cast.TargetID != nil {
				target = state.Units[*cast.TargetID]
				targetID = *cast.TargetID
			}
			applyNPCPowerEffects(id, targetID, unit, target, cast.Power, zone, now, state, rng)
			spendNPCPowerCost(unit, cast.Power)
			*events = append(*events, CombatEvent{
				AttackerID: id.String(),
				TargetID:   targetID.String(),
				PowerName:  cast.Power.Name,
			})
		}

		unit.Casting = nil
	}
}
