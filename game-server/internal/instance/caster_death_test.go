package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func casterDeathFixture(endsOnDeath bool) (state, prev *instancestate.InstanceState, casterID uuid.UUID, holder *instancestate.UnitState) {
	casterID = uuid.New()
	holderID := uuid.New()
	caster := &instancestate.UnitState{Status: instancestate.UnitStatusIdle}
	holder = &instancestate.UnitState{Status: instancestate.UnitStatusIdle}
	holder.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
		{Status: instanceconfig.Status{Name: "ward", EndsOnCasterDeath: endsOnDeath}, ApplierID: casterID, ExpiresAt: time.Now().Add(time.Minute)},
		{Status: instanceconfig.Status{Name: "other", EndsOnCasterDeath: endsOnDeath}, ApplierID: uuid.New(), ExpiresAt: time.Now().Add(time.Minute)},
	}
	state = &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{casterID: caster, holderID: holder}}
	state.GroundAreas = []instancestate.GroundArea{
		{ID: uuid.New(), CasterID: casterID, EndsOnCasterDeath: endsOnDeath},
		{ID: uuid.New(), CasterID: uuid.New(), EndsOnCasterDeath: endsOnDeath},
	}
	prev = &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{casterID: {Status: instancestate.UnitStatusIdle}}}
	caster.Status = instancestate.UnitStatusDead
	return state, prev, casterID, holder
}

func TestEndCasterDeathEffects_RemovesFlaggedStatusAndAreaOfDeadCaster(t *testing.T) {
	state, prev, casterID, holder := casterDeathFixture(true)

	instance.EndCasterDeathEffectsForTest(state, prev)

	require.Len(t, holder.ActiveStatusEffects, 1)
	assert.Equal(t, "other", holder.ActiveStatusEffects[0].Status.Name)
	require.Len(t, state.GroundAreas, 1)
	assert.NotEqual(t, casterID, state.GroundAreas[0].CasterID)
}

func TestEndCasterDeathEffects_KeepsUnflaggedEffects(t *testing.T) {
	state, prev, _, holder := casterDeathFixture(false)

	instance.EndCasterDeathEffectsForTest(state, prev)

	assert.Len(t, holder.ActiveStatusEffects, 2)
	assert.Len(t, state.GroundAreas, 2)
}

func TestEndCasterDeathEffects_IgnoresCasterThatWasAlreadyDead(t *testing.T) {
	state, prev, casterID, holder := casterDeathFixture(true)
	prev.Units[casterID].Status = instancestate.UnitStatusDead

	instance.EndCasterDeathEffectsForTest(state, prev)

	assert.Len(t, holder.ActiveStatusEffects, 2)
	assert.Len(t, state.GroundAreas, 2)
}
