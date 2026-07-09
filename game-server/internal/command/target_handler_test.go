package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
)

func TestTargetHandler_Type(t *testing.T) {
	assert.Equal(t, "target", command.TargetHandler{}.Type())
}

func TestTargetHandler_Deduplicate(t *testing.T) {
	assert.True(t, command.TargetHandler{}.Deduplicate())
}

func TestTargetHandler_SetsTarget(t *testing.T) {
	h := command.TargetHandler{}
	unitID := uuid.New()
	targetID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.TargetPayload{TargetID: &targetID}, state))

	require.NotNil(t, state.Units[unitID].Target)
	assert.Equal(t, targetID, *state.Units[unitID].Target)
}

func TestTargetHandler_ClearsTarget(t *testing.T) {
	h := command.TargetHandler{}
	unitID := uuid.New()
	existing := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Target = &existing

	require.NoError(t, h.Handle(unitID, command.TargetPayload{TargetID: nil}, state))

	assert.Nil(t, state.Units[unitID].Target)
}

func TestTargetHandler_MissingUnitIsNoOp(t *testing.T) {
	h := command.TargetHandler{}
	targetID := uuid.New()
	state := emptyState()

	assert.NoError(t, h.Handle(uuid.New(), command.TargetPayload{TargetID: &targetID}, state))
}
