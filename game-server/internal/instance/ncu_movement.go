package instance

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// tickNCUMovement advances every NCU's patrol/wander, the same state machine
// idle units use.
func tickNCUMovement(state *instancestate.InstanceState, dt float64, rng *rand.Rand) {
	for _, n := range state.NCUs {
		mv := n.MovementConfig
		if mv.Type == "" || mv.Type == "still" {
			continue
		}
		if n.Movement.MovementPhase == "" {
			initNPCMovement(&n.Position, &n.Movement, mv, rng)
			if n.Movement.MovementPhase == "" {
				continue
			}
		}
		tickNPCMovement(&n.Position, &n.Movement, mv, BaseMobSpeed*n.SpeedFactor, dt, rng)
	}
}
