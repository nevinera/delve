package command_test

import (
	"math/rand"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestBasicAttack_AgainstALeashingNPC_DoesNothing(t *testing.T) {
	playerID, targetID := uuid.New(), uuid.New()
	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 50; i++ { // every roll, hit or miss, must do nothing
		state := attackingStateWithTarget(playerID, targetID, 0, 0, 0, 1)
		target := state.Units[targetID]
		target.Status = instancestate.UnitStatusLeashing
		target.Hostility = "hostile"
		stampStats(state, instanceconfig.Zone{})

		require.NoError(t, command.BasicAttackHandler{Rng: rng}.Handle(playerID, command.BasicAttackPayload{}, instanceconfig.Zone{}, state))

		assert.Equal(t, 50.0, target.Health)
		assert.Nil(t, target.TaggedBy, "an evading NPC can't be tagged for loot")
		assert.Equal(t, instancestate.UnitStatusLeashing, target.Status, "attacking it doesn't pull it")
		assert.False(t, target.DamageTakenThisTick)
	}
}

func TestIncomingDamage_IsZeroWhileEvading(t *testing.T) {
	target := &instancestate.UnitState{Status: instancestate.UnitStatusLeashing}
	assert.Zero(t, command.IncomingDamage(target, instanceconfig.Zone{}, 100, true, rand.New(rand.NewSource(1))))
}

func TestApplyStatus_SkipsEvadingTargetsExceptTheirOwn(t *testing.T) {
	target := &instancestate.UnitState{Status: instancestate.UnitStatusLeashing}
	status := instanceconfig.Status{Name: "Poisoned"}

	command.ApplyStatus(target, nakedApplier(), uuid.New(), status, 10, instanceconfig.Zone{}, time.Now())
	assert.Empty(t, target.ActiveStatusEffects)

	command.ApplyStatus(target, target, uuid.New(), instanceconfig.Status{Name: "Enraged"}, 10, instanceconfig.Zone{}, time.Now())
	assert.Len(t, target.ActiveStatusEffects, 1)
}

func TestIsEvading(t *testing.T) {
	assert.True(t, command.IsEvading(&instancestate.UnitState{Status: instancestate.UnitStatusLeashing}))
	assert.False(t, command.IsEvading(&instancestate.UnitState{Status: instancestate.UnitStatusEngaged}))
	assert.False(t, command.IsEvading(nil))
}
