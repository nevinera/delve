package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
)

func TestStartAttackingHandler_Type(t *testing.T) {
	assert.Equal(t, "start_attacking", command.StartAttackingHandler{}.Type())
}

func TestStartAttackingHandler_Deduplicate(t *testing.T) {
	assert.True(t, command.StartAttackingHandler{}.Deduplicate())
}

func TestStartAttackingHandler_SetsAttackingWhenTargeted(t *testing.T) {
	h := command.StartAttackingHandler{}
	unitID := uuid.New()
	targetID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Target = &targetID

	require.NoError(t, h.Handle(unitID, command.StartAttackingPayload{}, state))

	assert.True(t, state.Units[unitID].Attacking)
}

func TestStartAttackingHandler_NoTargetIsNoOp(t *testing.T) {
	h := command.StartAttackingHandler{}
	unitID := uuid.New()
	state := stateWithUnit(unitID)

	require.NoError(t, h.Handle(unitID, command.StartAttackingPayload{}, state))

	assert.False(t, state.Units[unitID].Attacking)
}

func TestStartAttackingHandler_MissingUnitIsNoOp(t *testing.T) {
	h := command.StartAttackingHandler{}
	assert.NoError(t, h.Handle(uuid.New(), command.StartAttackingPayload{}, emptyState()))
}
