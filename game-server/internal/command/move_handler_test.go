package command_test

import (
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stateWithUnit(unitID uuid.UUID) *instancestate.InstanceState {
	return &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			unitID: {
				ZoneUnitIdentifier: "player:Aldric",
				Position:           instanceconfig.Position{X: 0, Y: 0, Angle: 0},
			},
		},
	}
}

func TestMoveHandler_Type(t *testing.T) {
	assert.Equal(t, "move", command.MoveHandler{}.Type())
}

func TestMoveHandler_Deduplicate(t *testing.T) {
	assert.True(t, command.MoveHandler{}.Deduplicate())
}

func TestMoveHandler_UpdatesFacing(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{Facing: 180.0}, instanceconfig.Zone{}, state))

	assert.Equal(t, 180.0, state.Units[unitID].Position.Angle)
}

func TestMoveHandler_SetsActiveKeys(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 90.0,
		Keys:   []command.MoveKey{command.MoveKeyForward, command.MoveKeyStrafeRight},
	}, instanceconfig.Zone{}, state))

	intent := state.Units[unitID].MovementIntent
	assert.True(t, intent.Forward)
	assert.False(t, intent.Backward)
	assert.False(t, intent.StrafeLeft)
	assert.True(t, intent.StrafeRight)
}

func TestMoveHandler_EmptyKeysClearsIntent(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].MovementIntent = instancestate.MovementIntent{
		Forward: true, StrafeLeft: true,
	}

	require.NoError(t, h.Handle(unitID, command.MovePayload{Facing: 0, Keys: nil}, instanceconfig.Zone{}, state))

	assert.Equal(t, instancestate.MovementIntent{}, state.Units[unitID].MovementIntent)
}

func TestMoveHandler_UnknownKeyIsIgnored(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Keys: []command.MoveKey{"turbo_boost"},
	}, instanceconfig.Zone{}, state))

	assert.Equal(t, instancestate.MovementIntent{}, state.Units[unitID].MovementIntent)
}

func TestMoveHandler_DeadUnitIsNoOp(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Status = instancestate.UnitStatusDead
	state.Units[unitID].MovementIntent = instancestate.MovementIntent{Forward: true}

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 90.0,
		Keys:   []command.MoveKey{command.MoveKeyBackward},
	}, instanceconfig.Zone{}, state))

	unit := state.Units[unitID]
	assert.Equal(t, 0.0, unit.Position.Angle, "facing should not change")
	assert.True(t, unit.MovementIntent.Forward, "intent should not change")
}

func TestMoveHandler_MissingUnitIsNoOp(t *testing.T) {
	h := command.MoveHandler{}
	state := emptyState()

	assert.NoError(t, h.Handle(uuid.New(), command.MovePayload{Facing: 45.0}, instanceconfig.Zone{}, state))
}

func ptr(v float64) *float64 { return &v }

func TestMoveHandler_WithPosition_SetsPosition(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 90.0,
		X:      ptr(10.0),
		Y:      ptr(15.0),
	}, instanceconfig.Zone{}, state))

	unit := state.Units[unitID]
	assert.InDelta(t, 10.0, unit.Position.X, 1e-9)
	assert.InDelta(t, 15.0, unit.Position.Y, 1e-9)
	assert.InDelta(t, 90.0, unit.Position.Angle, 1e-9)
}

func TestMoveHandler_WithPosition_ClearsIntent(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].MovementIntent = instancestate.MovementIntent{Forward: true}

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 0,
		Keys:   []command.MoveKey{command.MoveKeyForward},
		X:      ptr(5.0),
		Y:      ptr(5.0),
	}, instanceconfig.Zone{}, state))

	assert.Equal(t, instancestate.MovementIntent{}, state.Units[unitID].MovementIntent)
}

func TestMoveHandler_PartialPosition_FallsBackToKeys(t *testing.T) {
	// Only X provided (no Y) — should fall back to key-based intent.
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 0,
		Keys:   []command.MoveKey{command.MoveKeyForward},
		X:      ptr(5.0),
		// Y intentionally absent
	}, instanceconfig.Zone{}, state))

	assert.True(t, state.Units[unitID].MovementIntent.Forward)
	// Position should not have been set to 5,0
	assert.InDelta(t, 0.0, state.Units[unitID].Position.X, 1e-9)
}

// --- Feasibility clamping (see move_feasibility.go) ---

func TestMoveHandler_WithPosition_ClampsExcessiveDistance(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 20.0

	// The very first move (LastMoveAt zero) gets the max elapsed-time budget:
	// speed(20) * 1.0s * 1.3 tolerance = 26ft.
	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(100.0), Y: ptr(0.0)}, instanceconfig.Zone{}, state))

	unit := state.Units[unitID]
	assert.InDelta(t, 26.0, unit.Position.X, 1e-6)
}

func TestMoveHandler_WithPosition_AcceptsMoveWithinBudget(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 20.0

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(10.0), Y: ptr(0.0)}, instanceconfig.Zone{}, state))

	assert.InDelta(t, 10.0, state.Units[unitID].Position.X, 1e-9)
}

func TestMoveHandler_WithPosition_SecondMoveIsBudgetedByElapsedTime(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 20.0

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(0.0), Y: ptr(0.0)}, instanceconfig.Zone{}, state))
	// Called again immediately after - negligible elapsed time means a
	// negligible budget, regardless of how far this move asks to go.
	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(100.0), Y: ptr(0.0)}, instanceconfig.Zone{}, state))

	assert.Less(t, state.Units[unitID].Position.X, 1.0)
}

func TestMoveHandler_WithPosition_ClampsAtWall(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 20.0
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Identifier: "", // stateWithUnit's unit has no MapIdentifier set (zero value)
			Barriers: []instanceconfig.Barrier{{
				Type:      "wall",
				Locations: []instanceconfig.Location{{X: 5, Y: -10}, {X: 5, Y: 10}},
			}},
		}},
	}

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(9.0), Y: ptr(0.0)}, zone, state))

	unit := state.Units[unitID]
	assert.InDelta(t, 5.0, unit.Position.X, 1e-6, "should stop right at the wall, not cross it")
}

func TestMoveHandler_WithPosition_ClampsAtCircleBarrier(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 20.0
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Identifier: "",
			Barriers: []instanceconfig.Barrier{{
				Type:     "circle",
				Location: &instanceconfig.Location{X: 10, Y: 0},
				Radius:   3.0,
			}},
		}},
	}

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(20.0), Y: ptr(0.0)}, zone, state))

	unit := state.Units[unitID]
	assert.InDelta(t, 7.0, unit.Position.X, 1e-6, "should stop at the circle's edge (center 10, radius 3)")
}

func TestMoveHandler_WithPosition_FallsBackToDefaultSpeedWhenUnset(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	// Speed left at its zero value.

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(500.0), Y: ptr(0.0)}, instanceconfig.Zone{}, state))

	// fallbackPlayerSpeed(20) * 1.0s * 1.3 tolerance = 26ft.
	assert.InDelta(t, 26.0, state.Units[unitID].Position.X, 1e-6)
}

func TestMoveHandler_WithPosition_UpdatesLastMoveAt(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	before := state.Units[unitID].LastMoveAt
	require.True(t, before.IsZero())

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(1.0), Y: ptr(1.0)}, instanceconfig.Zone{}, state))

	assert.False(t, state.Units[unitID].LastMoveAt.IsZero())
}

func TestMoveHandler_ExactDiagonalDistance(t *testing.T) {
	// Sanity check on the distance math itself, independent of clamping.
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Speed = 100.0 // large budget, so this move is unclamped

	require.NoError(t, h.Handle(unitID, command.MovePayload{X: ptr(3.0), Y: ptr(4.0)}, instanceconfig.Zone{}, state))

	unit := state.Units[unitID]
	assert.InDelta(t, 5.0, math.Hypot(unit.Position.X, unit.Position.Y), 1e-9)
}
