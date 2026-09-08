package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestExpireStatusEffects_RemovesExpiredEntry(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, uuid.New(), instanceconfig.Status{Name: "poison", Stacking: "replace"}, 1.0, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		assert.Empty(t, u.ActiveStatusEffects)
	}
}

func TestExpireStatusEffects_KeepsUnexpiredEntry(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, uuid.New(), instanceconfig.Status{Name: "poison", Stacking: "replace"}, 10.0, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(1*time.Second))

	for _, u := range state.Units {
		require.Len(t, u.ActiveStatusEffects, 1)
	}
}

func TestExpireStatusEffects_RemovesWholeStackAtOnce(t *testing.T) {
	// All stacks of a "stack" status share one timer (docs/schema/status.md)
	// - expiry removes the entire entry, never decrements it.
	state := stateWithUnit(t)
	now := time.Now()
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "bleed", Stacking: "stack", MaxStacks: 5}
	for _, u := range state.Units {
		command.ApplyStatus(u, applierID, status, 1.0, now)
		command.ApplyStatus(u, applierID, status, 1.0, now)
		command.ApplyStatus(u, applierID, status, 1.0, now)
	}

	for _, u := range state.Units {
		require.Equal(t, 3, u.ActiveStatusEffects[0].Stacks)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		assert.Empty(t, u.ActiveStatusEffects)
	}
}

func TestExpireStatusEffects_OnlyRemovesExpiredEntriesLeavesOthers(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, uuid.New(), instanceconfig.Status{Name: "short", Stacking: "replace"}, 1.0, now)
		command.ApplyStatus(u, uuid.New(), instanceconfig.Status{Name: "long", Stacking: "replace"}, 10.0, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		require.Len(t, u.ActiveStatusEffects, 1)
		assert.Equal(t, "long", u.ActiveStatusEffects[0].Status.Name)
	}
}
