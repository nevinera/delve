package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
)

func TestStopAttackingHandler_Type(t *testing.T) {
	assert.Equal(t, "stop_attacking", command.StopAttackingHandler{}.Type())
}

func TestStopAttackingHandler_Deduplicate(t *testing.T) {
	assert.True(t, command.StopAttackingHandler{}.Deduplicate())
}

func TestStopAttackingHandler_ClearsAttacking(t *testing.T) {
	h := command.StopAttackingHandler{}
	unitID := uuid.New()
	targetID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Target = &targetID
	state.Units[unitID].Attacking = true

	require.NoError(t, h.Handle(unitID, command.StopAttackingPayload{}, state))

	assert.False(t, state.Units[unitID].Attacking)
}

func TestStopAttackingHandler_LeavesTargetAlone(t *testing.T) {
	h := command.StopAttackingHandler{}
	unitID := uuid.New()
	targetID := uuid.New()
	state := stateWithUnit(unitID)
	state.Units[unitID].Target = &targetID
	state.Units[unitID].Attacking = true

	require.NoError(t, h.Handle(unitID, command.StopAttackingPayload{}, state))

	require.NotNil(t, state.Units[unitID].Target)
	assert.Equal(t, targetID, *state.Units[unitID].Target)
}

func TestStopAttackingHandler_MissingUnitIsNoOp(t *testing.T) {
	h := command.StopAttackingHandler{}
	assert.NoError(t, h.Handle(uuid.New(), command.StopAttackingPayload{}, emptyState()))
}
