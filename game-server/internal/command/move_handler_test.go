package command_test

import (
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

	require.NoError(t, h.Handle(unitID, command.MovePayload{Facing: 180.0}, state))

	assert.Equal(t, 180.0, state.Units[unitID].Position.Angle)
}

func TestMoveHandler_SetsActiveKeys(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Facing: 90.0,
		Keys:   []command.MoveKey{command.MoveKeyForward, command.MoveKeyStrafeRight},
	}, state))

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

	require.NoError(t, h.Handle(unitID, command.MovePayload{Facing: 0, Keys: nil}, state))

	assert.Equal(t, instancestate.MovementIntent{}, state.Units[unitID].MovementIntent)
}

func TestMoveHandler_UnknownKeyIsIgnored(t *testing.T) {
	h := command.MoveHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.MovePayload{
		Keys: []command.MoveKey{"turbo_boost"},
	}, state))

	assert.Equal(t, instancestate.MovementIntent{}, state.Units[unitID].MovementIntent)
}

func TestMoveHandler_MissingUnitIsNoOp(t *testing.T) {
	h := command.MoveHandler{}
	state := emptyState()

	assert.NoError(t, h.Handle(uuid.New(), command.MovePayload{Facing: 45.0}, state))
}
