package instance_test

import (
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

const (
	tickSeconds     = 0.1  // TickInterval.Seconds()
	baseSpeed       = 20.0 // basePlayerSpeed
	expectedDistPerTick = baseSpeed * tickSeconds
)

func movingUnit(angle float64, intent instancestate.MovementIntent) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		Position:       instanceconfig.Position{X: 0, Y: 0, Angle: angle},
		MovementIntent: intent,
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}
	return u, s
}

func TestApplyMovement_ForwardFacingNorth(t *testing.T) {
	u, s := movingUnit(0, instancestate.MovementIntent{Forward: true})
	instance.ApplyMovementForTest(s)

	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, expectedDistPerTick, u.Position.Y, 1e-9)
}

func TestApplyMovement_ForwardFacingEast(t *testing.T) {
	u, s := movingUnit(90, instancestate.MovementIntent{Forward: true})
	instance.ApplyMovementForTest(s)

	assert.InDelta(t, expectedDistPerTick, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestApplyMovement_BackwardFacingNorth(t *testing.T) {
	u, s := movingUnit(0, instancestate.MovementIntent{Backward: true})
	instance.ApplyMovementForTest(s)

	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, -expectedDistPerTick, u.Position.Y, 1e-9)
}

func TestApplyMovement_StrafeRightFacingNorth(t *testing.T) {
	u, s := movingUnit(0, instancestate.MovementIntent{StrafeRight: true})
	instance.ApplyMovementForTest(s)

	assert.InDelta(t, expectedDistPerTick, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestApplyMovement_StrafeLeftFacingNorth(t *testing.T) {
	u, s := movingUnit(0, instancestate.MovementIntent{StrafeLeft: true})
	instance.ApplyMovementForTest(s)

	assert.InDelta(t, -expectedDistPerTick, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestApplyMovement_DiagonalSameDistanceAsStraight(t *testing.T) {
	_, sStraight := movingUnit(0, instancestate.MovementIntent{Forward: true})
	uDiag, sDiag := movingUnit(0, instancestate.MovementIntent{Forward: true, StrafeRight: true})

	instance.ApplyMovementForTest(sStraight)
	instance.ApplyMovementForTest(sDiag)

	diagDist := math.Sqrt(uDiag.Position.X*uDiag.Position.X + uDiag.Position.Y*uDiag.Position.Y)
	assert.InDelta(t, expectedDistPerTick, diagDist, 1e-9, "diagonal should cover the same distance as straight")
}

func TestApplyMovement_OpposingKeysCancelOut(t *testing.T) {
	u, s := movingUnit(0, instancestate.MovementIntent{Forward: true, Backward: true})
	instance.ApplyMovementForTest(s)

	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}

func TestApplyMovement_NoIntentNoMovement(t *testing.T) {
	u, s := movingUnit(45, instancestate.MovementIntent{})
	instance.ApplyMovementForTest(s)

	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}
