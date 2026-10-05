package command_test

import (
	"math/rand"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func areaPower(effects ...instanceconfig.PowerEffect) command.UsePowerPayload {
	return command.UsePowerPayload{Power: instanceconfig.Power{GlobalCooldown: 1.5, Effects: effects}}
}

func areaHarm(rangeFt float64) instanceconfig.PowerEffect {
	amount := instanceconfig.ValueRange{1, 1}
	r := instanceconfig.ZeroBasedValueRange{0, rangeFt}
	return instanceconfig.PowerEffect{Type: "harm", Affects: "bAll", Amount: &amount, Range: &r}
}

// areaState is a player at the origin with no target, plus NPCs at the given
// x positions (all on y=0) with the given hostility.
func areaState(playerID uuid.UUID, npcs map[uuid.UUID]npcSpec) *instancestate.InstanceState {
	state := stateWithUnit(playerID)
	state.Units[playerID].Health, state.Units[playerID].MaxHealth = 50, 100
	for id, n := range npcs {
		state.Units[id] = &instancestate.UnitState{
			ZoneUnitIdentifier: "npc_" + id.String()[:4],
			Position:           instanceconfig.Position{X: n.x},
			Hostility:          n.hostility,
			Health:             50, MaxHealth: 50,
			Status: instancestate.UnitStatusIdle,
		}
	}
	return state
}

type npcSpec = struct {
	x         float64
	hostility string
}

func TestUsePowerHandler_BAllHitsHostileAndNeutralNPCsInRangeWithoutATarget(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	playerID, near, neutral, far, friendly := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	npcs := map[uuid.UUID]npcSpec{
		near: {4, "hostile"}, neutral: {6, "neutral"}, far: {40, "hostile"}, friendly: {3, "friendly"},
	}
	state := areaState(playerID, npcs)
	payload := areaPower(areaHarm(8))

	// Repeat so the per-hit miss roll can't make the assertions flaky.
	for i := 0; i < 20; i++ {
		state.Units[playerID].GlobalCooldownEndsAt = state.Units[playerID].GlobalCooldownEndsAt.AddDate(-1, 0, 0)
		stampStats(state, instanceconfig.Zone{})
		require.NoError(t, command.UsePowerHandler{Rng: rng}.Handle(playerID, payload, instanceconfig.Zone{}, state))
	}

	assert.Less(t, state.Units[near].Health, 50.0, "a hostile NPC in range is hit")
	assert.Less(t, state.Units[neutral].Health, 50.0, "so is a neutral one")
	assert.Equal(t, 50.0, state.Units[far].Health, "out of range isn't")
	assert.Equal(t, 50.0, state.Units[friendly].Health, "friendly NPCs aren't")
	assert.Equal(t, 50.0, state.Units[playerID].Health, "nor the caster")
	assert.Nil(t, state.Units[playerID].Target, "an area power needs no target")
}

func TestUsePowerHandler_GAllAppliesToTheCasterOnly(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	playerID, ally := uuid.New(), uuid.New()
	state := areaState(playerID, map[uuid.UUID]npcSpec{ally: {2, "friendly"}})
	state.Units[ally].Health = 10
	amount := instanceconfig.ValueRange{5, 5}
	r := instanceconfig.ZeroBasedValueRange{0, 20}
	payload := areaPower(instanceconfig.PowerEffect{Type: "heal", Affects: "gAll", Amount: &amount, Range: &r})

	stampStats(state, instanceconfig.Zone{})
	require.NoError(t, command.UsePowerHandler{Rng: rng}.Handle(playerID, payload, instanceconfig.Zone{}, state))

	assert.Greater(t, state.Units[playerID].Health, 50.0, "the caster is healed")
	assert.Equal(t, 10.0, state.Units[ally].Health, "nobody else is, until there are parties")
}

func TestResolveCastTarget_AreaOnlyPowersNeedNoTarget(t *testing.T) {
	playerID := uuid.New()
	state := areaState(playerID, nil)

	_, ok := command.ResolveCastTarget(state.Units[playerID], nil, areaPower(areaHarm(8)).Power, state)

	assert.True(t, ok)
}

func TestUsePowerHandler_BTargetRadiusSplashesNPCsAroundTheTarget(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	playerID, target, beside, far, friendly := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	npcs := map[uuid.UUID]npcSpec{
		target: {20, "hostile"}, beside: {24, "neutral"}, far: {35, "hostile"}, friendly: {22, "friendly"},
	}
	state := areaState(playerID, npcs)
	targetUUID := target
	state.Units[playerID].Target = &targetUUID
	state.Units[playerID].Position.Angle = 90 // facing +x, toward the target
	splash := areaHarm(30)
	splash.Affects, splash.Radius = "bTarget", 6
	payload := areaPower(splash)

	for i := 0; i < 20; i++ {
		state.Units[playerID].GlobalCooldownEndsAt = state.Units[playerID].GlobalCooldownEndsAt.AddDate(-1, 0, 0)
		stampStats(state, instanceconfig.Zone{})
		require.NoError(t, command.UsePowerHandler{Rng: rng}.Handle(playerID, payload, instanceconfig.Zone{}, state))
	}

	assert.Less(t, state.Units[target].Health, 50.0, "the target is hit")
	assert.Less(t, state.Units[beside].Health, 50.0, "so is an NPC 4ft from it")
	assert.Equal(t, 50.0, state.Units[far].Health, "an NPC 15ft from it isn't")
	assert.Equal(t, 50.0, state.Units[friendly].Health, "friendly NPCs aren't")
}
