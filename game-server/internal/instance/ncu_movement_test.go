package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func ncuStateWith(mv instanceconfig.UnitMovement) (*instancestate.NCUState, *instancestate.InstanceState) {
	n := &instancestate.NCUState{
		ZoneNCUIdentifier: "grizzle",
		MapIdentifier:     "map1",
		Position:          pos(0, 0),
		SpeedFactor:       1.0,
		MovementConfig:    mv,
	}
	return n, &instancestate.InstanceState{NCUs: map[uuid.UUID]*instancestate.NCUState{uuid.New(): n}}
}

func TestTickNCUMovement_StillNCUStaysPut(t *testing.T) {
	n, s := ncuStateWith(instanceconfig.UnitMovement{Type: "still"})

	instance.TickNCUMovementForTest(s, 1.0)

	assert.Equal(t, pos(0, 0), n.Position)
}

func TestTickNCUMovement_PatrolMovesTowardFirstStep(t *testing.T) {
	n, s := ncuStateWith(instanceconfig.UnitMovement{
		Type:   "patrol",
		Choose: "loop",
		Steps: []instanceconfig.MovementStep{
			{Position: pos(20, 0), MovementRate: 1.0},
			{Position: pos(0, 0), MovementRate: 1.0},
		},
	})

	instance.TickNCUMovementForTest(s, 0.5) // initializes and moves in the same tick

	assert.InDelta(t, instance.BaseMobSpeed*0.5, n.Position.X, 0.001)
	assert.Equal(t, "moving", n.Movement.MovementPhase)
}

func TestTickNCUMovement_SpeedFactorScalesMovement(t *testing.T) {
	n, s := ncuStateWith(instanceconfig.UnitMovement{
		Type:   "patrol",
		Choose: "loop",
		Steps: []instanceconfig.MovementStep{
			{Position: pos(20, 0), MovementRate: 1.0},
			{Position: pos(0, 0), MovementRate: 1.0},
		},
	})
	n.SpeedFactor = 0.5

	instance.TickNCUMovementForTest(s, 0.5)

	assert.InDelta(t, instance.BaseMobSpeed*0.25, n.Position.X, 0.001)
}

func TestTickNCUMovement_WanderStaysInRadius(t *testing.T) {
	speed := instanceconfig.ValueRange{1.0, 1.0}
	wait := instanceconfig.ValueRange{0, 0}
	n, s := ncuStateWith(instanceconfig.UnitMovement{
		Type: "wander", Location: &instanceconfig.Location{X: 0, Y: 0}, Radius: 5, Speed: &speed, WaitTime: &wait,
	})

	for range 200 {
		instance.TickNCUMovementForTest(s, 0.1)
		assert.LessOrEqual(t, n.Position.X*n.Position.X+n.Position.Y*n.Position.Y, 25.0+0.001)
	}
}
