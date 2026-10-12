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

// A zone whose hills map has a 4x2 ft snare at the origin (reach 2 ft),
// taking useTime seconds (nil: the default).
func snareZone(useTime *float64) instanceconfig.Zone {
	return instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "hills", Interactables: []instanceconfig.Interactable{
		{Identifier: "snare-1", Name: "Snare", Size: instanceconfig.Size{Width: 4, Height: 2}, UseTime: useTime},
	}}}}
}

func useState(playerX float64, playerMap string) (*instancestate.InstanceState, uuid.UUID) {
	unitID := uuid.New()
	return &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{unitID: {
		MapIdentifier: playerMap, Position: instanceconfig.Position{X: playerX}, Radius: 1, Status: instancestate.UnitStatusIdle,
	}}}, unitID
}

func TestUseInteractableHandler_StartsACastInRangeOfItsEdge(t *testing.T) {
	state, unitID := useState(13, "hills") // 10 + 1 + 2 feet away
	require.NoError(t, command.UseInteractableHandler{}.Handle(unitID, command.UseInteractablePayload{Interactable: "snare-1"}, snareZone(nil), state))
	cast := state.Units[unitID].Casting
	require.NotNil(t, cast)
	assert.Equal(t, "snare-1", cast.Interactable.Identifier)
	assert.InDelta(t, 1.0, cast.EndsAt.Sub(cast.StartedAt).Seconds(), 1e-9)
	assert.Nil(t, cast.TargetID)
	assert.Empty(t, state.PendingUses)
}

func TestUseInteractableHandler_UsesAnInstantOneAtOnce(t *testing.T) {
	state, unitID := useState(0, "hills")
	instant := 0.0
	_ = command.UseInteractableHandler{}.Handle(unitID, command.UseInteractablePayload{Interactable: "snare-1"}, snareZone(&instant), state)
	assert.Nil(t, state.Units[unitID].Casting)
	assert.Equal(t, []instancestate.Use{{UnitID: unitID, Interactable: "snare-1", Map: "hills"}}, state.PendingUses)
}

func TestUseInteractableHandler_IgnoresOutOfRangeOtherMapsUnknownAndBusy(t *testing.T) {
	for name, setup := range map[string]func() (*instancestate.InstanceState, uuid.UUID, string){
		"out of range": func() (*instancestate.InstanceState, uuid.UUID, string) {
			s, id := useState(13.5, "hills")
			return s, id, "snare-1"
		},
		"another map": func() (*instancestate.InstanceState, uuid.UUID, string) {
			s, id := useState(0, "woods")
			return s, id, "snare-1"
		},
		"unknown": func() (*instancestate.InstanceState, uuid.UUID, string) {
			s, id := useState(0, "hills")
			return s, id, "snare-9"
		},
		"already casting": func() (*instancestate.InstanceState, uuid.UUID, string) {
			s, id := useState(0, "hills")
			s.Units[id].Casting = &instancestate.CastState{Power: instanceconfig.Power{Name: "Fireball"}}
			return s, id, "snare-1"
		},
		"dead": func() (*instancestate.InstanceState, uuid.UUID, string) {
			s, id := useState(0, "hills")
			s.Units[id].Status = instancestate.UnitStatusDead
			return s, id, "snare-1"
		},
	} {
		t.Run(name, func(t *testing.T) {
			state, unitID, identifier := setup()
			before := state.Units[unitID].Casting
			_ = command.UseInteractableHandler{}.Handle(unitID, command.UseInteractablePayload{Interactable: identifier}, snareZone(nil), state)
			assert.Equal(t, before, state.Units[unitID].Casting)
			assert.Empty(t, state.PendingUses)
		})
	}
}
