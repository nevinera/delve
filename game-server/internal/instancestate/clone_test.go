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
			{Status: instanceconfig.Status{Name: "poison"}, ExpiresAt: expiresAt},
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

func TestClone_MutatingTaggedByDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)
	originalTagger := uuid.New()
	for _, u := range state.Units {
		t2 := originalTagger
		u.TaggedBy = &t2
	}

	clone := state.Clone()
	newTagger := uuid.New()
	for _, u := range clone.Units {
		u.TaggedBy = &newTagger
	}

	for _, u := range state.Units {
		assert.Equal(t, originalTagger, *u.TaggedBy)
	}
}

func TestClone_MutatingPowerCooldownsDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)
	exp := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, u := range state.Units {
		u.PowerCooldowns = map[string]time.Time{"Stab": exp}
	}

	clone := state.Clone()
	for _, u := range clone.Units {
		u.PowerCooldowns["Stab"] = time.Time{}
	}

	for _, u := range state.Units {
		assert.Equal(t, exp, u.PowerCooldowns["Stab"])
	}
}

func TestClone_MutatingResourcesDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)

	clone := state.Clone()
	for _, u := range clone.Units {
		u.Resources["Energy"].Current = 999
	}

	for _, u := range state.Units {
		assert.Equal(t, 25.0, u.Resources["Energy"].Current) // testUnitType's Resource.DefaultValue
	}
}

// This is the scenario the tick loop actually relies on: prevState is
// cloned BEFORE a tick's mutations, then diffed against the (mutated)
// current state afterward (see instance/messages.go's resourcesEqual) - a
// shallow-shared *ResourceState pointer between the two would make every
// resource change invisible to that diff, since "before" and "after" would
// always read the same underlying value.
func TestClone_MutatingOriginalAfterCloneDoesNotAffectClone(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)

	clone := state.Clone()
	for _, u := range state.Units {
		u.Resources["Energy"].Current = 999
	}

	for _, u := range clone.Units {
		assert.Equal(t, 25.0, u.Resources["Energy"].Current)
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

func TestClone_MutatingLootClaimsDoesNotAffectOriginal(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "goblin_a", UnitType: "goblin"},
	))
	require.NoError(t, err)
	charID := uuid.New()
	for _, u := range state.Units {
		u.LootItems = []instancestate.PendingLootItem{
			{
				ClaimID: uuid.New(),
				Item:    instanceconfig.Item{Identifier: "sword"},
				Claims:  []instancestate.CharacterLootClaim{{CharacterUnitID: charID, State: instancestate.LootClaimStateAvailable}},
			},
		}
	}

	clone := state.Clone()
	for _, u := range clone.Units {
		u.LootItems[0].Claims[0].State = instancestate.LootClaimStateLocked
	}

	for _, u := range state.Units {
		assert.Equal(t, instancestate.LootClaimStateAvailable, u.LootItems[0].Claims[0].State)
	}
}
