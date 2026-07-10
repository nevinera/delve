package instance

// Exports of internal symbols for use in package-level black-box tests.

import (
	"time"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func (inst *Instance) RegisterCommandHandlerForTest(h command.CommandHandler) {
	inst.commandProcessor.Register(h)
}

func ApplyMovementForTest(state *instancestate.InstanceState) {
	applyMovement(state)
}

func BuildFullStateMsgForTest(state *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildFullStateMsg(state, now, checksum)
}

func BuildDeltaMsgForTest(prev, curr *instancestate.InstanceState, now time.Time, checksum string) ([]byte, error) {
	return buildDeltaMsg(prev, curr, nil, now, checksum)
}

func PushOutOfSegmentForTest(px, py, r, ax, ay, bx, by float64) (float64, float64) {
	return pushOutOfSegment(px, py, r, ax, ay, bx, by)
}

func PushOutOfCircleForTest(px, py, unitRadius, cx, cy, barrierRadius float64) (float64, float64) {
	return pushOutOfCircle(px, py, unitRadius, cx, cy, barrierRadius)
}

func ResolveCollisionsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone) {
	resolveCollisions(state, zone)
}

func ApplyUnitBehaviorsForTest(state *instancestate.InstanceState, zone instanceconfig.Zone, dt float64) {
	applyUnitBehaviors(state, zone, dt) //nolint:errcheck
}

func ApplyNPCSeparationForTest(state *instancestate.InstanceState, dt float64) {
	applyNPCSeparation(state, dt)
}

func FacingTowardDegForTest(x1, y1, x2, y2 float64) float64 {
	return facingTowardDeg(x1, y1, x2, y2)
}

func LerpAngleDegForTest(a, b, t float64) float64 {
	return lerpAngleDeg(a, b, t)
}
