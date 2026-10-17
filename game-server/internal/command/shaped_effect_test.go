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

func shapedHarmPower(shape instanceconfig.AreaShape) command.UsePowerPayload {
	amount := instanceconfig.ValueRange{8.0, 14.0}
	return command.UsePowerPayload{Power: instanceconfig.Power{
		GlobalCooldown: 1.5,
		Effects:        []instanceconfig.PowerEffect{{Type: "harm", Affects: "bAll", Amount: &amount, Shape: &shape}},
	}}
}

// The player stands at the origin facing +y with a goblin 10ft ahead (the
// target) and another 10ft behind, so a forward line catches only the first.
func shapedFixture(playerID, inID, outID uuid.UUID) func() *instancestate.InstanceState {
	return func() *instancestate.InstanceState {
		state := stateWithPlayerAndTarget(playerID, inID, 0, 0, 0, 10)
		state.Units[outID] = &instancestate.UnitState{
			ZoneUnitIdentifier: "goblin_2", Hostility: "hostile", MapIdentifier: state.Units[playerID].MapIdentifier,
			Position: instanceconfig.Position{X: 0, Y: -10}, Health: 50.0, Status: instancestate.UnitStatusIdle,
		}
		state.Units[inID].MapIdentifier = state.Units[playerID].MapIdentifier
		state.Units[inID].Hostility = "hostile"
		return state
	}
}

func TestUsePowerHandler_ShapedHarmHitsOnlyUnitsInShape(t *testing.T) {
	playerID, inID, outID := uuid.New(), uuid.New(), uuid.New()
	payload := shapedHarmPower(instanceconfig.AreaShape{Type: "line", At: "self", Length: 20, Width: 4})
	zone := instanceconfig.Zone{}

	state := retryUntilPowerLands(t, playerID, inID, zone, payload, rand.New(rand.NewSource(1)), shapedFixture(playerID, inID, outID))

	assert.Less(t, state.Units[inID].Health, 50.0)
	assert.Equal(t, 50.0, state.Units[outID].Health)
}

func TestUsePowerHandler_ShapedHarmNeedsNoTargetWhenAnchoredOnCaster(t *testing.T) {
	playerID, inID, outID := uuid.New(), uuid.New(), uuid.New()
	state := shapedFixture(playerID, inID, outID)()
	state.Units[playerID].Target = nil
	payload := shapedHarmPower(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 12})

	hit := false
	for i := 0; i < 200 && !hit; i++ {
		state = shapedFixture(playerID, inID, outID)()
		state.Units[playerID].Target = nil
		stampStats(state, zone0())
		require.NoError(t, command.UsePowerHandler{Rng: rand.New(rand.NewSource(int64(i)))}.Handle(playerID, payload, zone0(), state))
		hit = state.Units[inID].Health < 50 && state.Units[outID].Health < 50
	}

	assert.True(t, hit)
}

func zone0() instanceconfig.Zone { return instanceconfig.Zone{} }
