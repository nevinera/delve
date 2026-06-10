package instancestate_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestClone_EqualToOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin", Position: instanceconfig.Position{X: 10, Y: 20, Angle: 90}},
	))
	require.NoError(t, err)

	clone := state.Clone()
	assert.Equal(t, state.Checksum(), clone.Checksum())
}

func TestClone_MutatingPositionDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)

	clone := state.Clone()
	for _, u := range clone.Units {
		u.Position.X = 999
	}

	for _, u := range state.Units {
		assert.NotEqual(t, float64(999), u.Position.X)
	}
}

func TestClone_MutatingHealthDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)

	clone := state.Clone()
	for _, u := range clone.Units {
		u.Health = 1
	}

	for _, u := range state.Units {
		assert.Equal(t, float64(100), u.Health)
	}
}

func TestClone_MutatingEffectsDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)
	expiresAt := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, u := range state.Units {
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{StatusIdentifier: "poison", ExpiresAt: expiresAt},
		}
	}

	clone := state.Clone()
	for _, u := range clone.Units {
		u.ActiveStatusEffects[0].ExpiresAt = time.Time{}
	}

	for _, u := range state.Units {
		assert.Equal(t, expiresAt, u.ActiveStatusEffects[0].ExpiresAt)
	}
}

func TestClone_MutatingTargetDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)
	originalTarget := uuid.New()
	for _, u := range state.Units {
		t2 := originalTarget
		u.Target = &t2
	}

	clone := state.Clone()
	newTarget := uuid.New()
	for _, u := range clone.Units {
		u.Target = &newTarget
	}

	for _, u := range state.Units {
		assert.Equal(t, originalTarget, *u.Target)
	}
}

func TestClone_NilTargetCopiedAsNil(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)

	clone := state.Clone()
	for _, u := range clone.Units {
		assert.Nil(t, u.Target)
	}
}
